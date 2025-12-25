import { chromium, Page, Browser } from 'playwright'
import { raffles, Raffle } from './raffle'
import { io } from './server'

interface ChatMessage {
  username: string
  message: string
}

export async function startBot(raffleId: string): Promise<void> {
  const raffle = raffles.get(raffleId)
  if (!raffle) {
    console.log('Raffle not found')
    return
  }

  console.log(`Starting bot for raffle ${raffleId}`)

  let browser: Browser | null = null
  let page: Page | null = null

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    })

    page = await browser.newPage()

    // Маскируем Playwright
    await page.addInitScript(() => {
      // Убираем навигатор WebDriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      })

      // Убираем Playwright из user-agent
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      })
    })

    await page.goto(raffle.streamLink, {
      waitUntil: 'networkidle',
      timeout: 30000
    })

    console.log('Page loaded')

    // Экспортируем функцию для обработки сообщений
    await page.exposeFunction('onNewMessage', (data: ChatMessage) => {
      if (!raffle.active) return
      if (data.message.trim() === raffle.codeWord) {
        if (!raffle.participants.has(data.username)) {
          raffle.participants.add(data.username)
          io.emit('participantJoined', {
            raffleId,
            user: data.username,
            count: raffle.participants.size
          })
          console.log(`New participant: ${data.username} (total: ${raffle.participants.size})`)
        }
      }
    })

    // Мониторинг чата
    await monitorChat(page, raffle)

    // Сохраняем ссылки на browser и page для остановки
    raffle.browser = browser
    raffle.page = page

  } catch (error) {
    console.error('Error starting bot:', error)

    // Закрываем браузер, если он был создан
    if (browser) {
      await browser.close().catch(err => {
        console.error('Error closing browser:', err)
      })
    }

    throw error
  }
}

async function monitorChat(page: Page, raffle: Raffle): Promise<void> {
  console.log('🕵️ Начинаем поиск чата...')

  // Сначала попробуем найти селекторы
  const dynamicSelectors = await findChatSelectors(page)

  // Комбинируем со статическими селекторами
  const allSelectors = [
    // YouTube
    '#chatframe',
    '#chat',
    '.yt-live-chat-app',
    'iframe#chatframe',
    'iframe[src*="chat"]',

    // Twitch
    '[data-a-target="chat-scrollable-area"]',
    '.chat-scrollable-area',
    '.chat-list',
    '[data-test-selector="chat-room-component-layout"]',

    // Общие
    '[aria-label*="chat" i]',
    '[class*="chat" i]',
    '[id*="chat" i]',
    'iframe',
    'section',
    'aside',
    'div[role="log"]',
    'div[role="feed"]',

    // Динамически найденные
    ...dynamicSelectors
  ]

  console.log(`🔄 Проверяем ${allSelectors.length} селекторов...`)

  let chatContainer: any = null

  for (const selector of allSelectors) {
    try {
      console.log(`Пробуем селектор: ${selector}`)

      // Сначала ищем в iframe
      const frames = page.frames()
      for (const frame of frames) {
        try {
          const element = await frame.$(selector)
          if (element) {
            const isVisible = await element.isVisible()
            if (isVisible) {
              chatContainer = { frame, element, selector }
              console.log(`✅ Нашли чат в iframe: ${selector}`)
              console.log(`   URL iframe: ${frame.url()}`)
              break
            }
          }
        } catch (e) {
          continue
        }
      }

      if (!chatContainer) {
        const element = await page.$(selector)
        if (element) {
          const isVisible = await element.isVisible()
          if (isVisible) {
            chatContainer = { frame: page, element, selector }
            console.log(`✅ Нашли чат: ${selector}`)
          }
        }
      }

      if (chatContainer) break
    } catch (e) {
      console.log(`❌ Ошибка с селектором ${selector}:`, (e as Error).message)
      continue
    }
  }

  if (!chatContainer) {
    console.log('❌ Чат не найден, используем fallback...')
    await fallbackChatDetection(page)
    return
  }

  console.log(`🎯 Начинаем мониторинг чата через селектор: ${chatContainer.selector}`)
  await setupChatObserver(chatContainer)
}

async function fallbackChatDetection(page: Page): Promise<void> {
  console.log('🔄 Используем fallback метод поиска чата...')

  await page.evaluate(() => {
    // Функция для поиска чата по структуре
    function findChatContainer(): HTMLElement | null {
      // Ищем контейнеры с часто обновляющимся контентом
      const allContainers = Array.from(document.querySelectorAll('div, section, aside, main'))

      // Сортируем по количеству дочерних элементов (чат обычно имеет много сообщений)
      const sortedContainers = allContainers.sort((a, b) =>
        b.children.length - a.children.length
      )

      // Берем первые 5 самых больших контейнеров
      for (const container of sortedContainers.slice(0, 5)) {
        const text = container.textContent || ''
        const lines = text.split('\n').filter(line => line.trim())

        // Ищем паттерны чата: много строк с двоеточиями
        const chatLines = lines.filter(line => {
          return line.includes(':') &&
            line.split(':').length >= 2 &&
            line.length < 500
        })

        if (chatLines.length >= 3) {
          console.log('Found potential chat container:', container)
          return container as HTMLElement
        }
      }

      return null
    }

    const chatContainer = findChatContainer()

    if (chatContainer) {
      console.log('🎯 Fallback: найден контейнер чата')

      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              const el = node as HTMLElement
              const text = el.textContent || ''

              // Ищем сообщения в формате "имя: текст"
              const lines = text.split('\n')
              lines.forEach(line => {
                const colonIndex = line.indexOf(':')
                if (colonIndex > -1) {
                  const username = line.substring(0, colonIndex).trim()
                  const message = line.substring(colonIndex + 1).trim()

                  if (username && message) {
                    // @ts-ignore
                    if (window.onNewMessage) {
                      // @ts-ignore
                      window.onNewMessage({ username, message })
                    }
                  }
                }
              })
            }
          })
        })
      })

      observer.observe(chatContainer, {
        childList: true,
        subtree: true,
        characterData: true
      })

      // Также мониторим изменения текста
      const textObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.type === 'characterData' || mutation.type === 'childList') {
            const target = mutation.target as HTMLElement
            const text = target.textContent || ''
            const colonIndex = text.indexOf(':')

            if (colonIndex > -1) {
              const username = text.substring(0, colonIndex).trim()
              const message = text.substring(colonIndex + 1).trim()

              if (username && message) {
                // @ts-ignore
                if (window.onNewMessage) {
                  // @ts-ignore
                  window.onNewMessage({ username, message })
                }
              }
            }
          }
        })
      })

      textObserver.observe(chatContainer, {
        characterData: true,
        subtree: true,
        childList: true
      })

    } else {
      console.log('❌ Fallback: чат не найден')
    }
  })
}

async function setupChatObserver(chatContainer: any): Promise<void> {
  await chatContainer.frame.evaluate((container: Element) => {
    console.log('🎬 Настройка observer для чата...')

    let messageCount = 0

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        // Обрабатываем добавленные узлы
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(addedNode => {
            if (addedNode.nodeType === 1) {
              messageCount++
              const el = addedNode as HTMLElement

              // Собираем весь текст из элемента
              const walker = document.createTreeWalker(
                el,
                NodeFilter.SHOW_TEXT,
                null
              )

              let fullText = ''
              let textNode = walker.nextNode()
              while (textNode) {
                fullText += textNode.textContent || ''
                textNode = walker.nextNode()
              }

              // Разделяем на строки
              const lines = fullText.split('\n').filter(line => line.trim())

              lines.forEach(line => {
                // Ищем паттерн "имя: сообщение"
                const match = line.match(/^([^:]+):\s*(.+)$/)
                if (match) {
                  const username = match[1].trim()
                  const message = match[2].trim()

                  if (username && message) {
                    console.log(`💬 Сообщение ${messageCount}: ${username}: ${message.substring(0, 50)}...`)

                    // @ts-ignore
                    if (window.onNewMessage) {
                      // @ts-ignore
                      window.onNewMessage({ username, message })
                    }
                  }
                }
              })
            }
          })
        }

        // Обрабатываем изменения текста
        if (mutation.type === 'characterData') {
          const text = mutation.target.textContent || ''
          const match = text.match(/^([^:]+):\s*(.+)$/)
          if (match) {
            const username = match[1].trim()
            const message = match[2].trim()

            if (username && message) {
              console.log(`✏️  Изменение: ${username}: ${message.substring(0, 50)}...`)

              // @ts-ignore
              if (window.onNewMessage) {
                // @ts-ignore
                window.onNewMessage({ username, message })
              }
            }
          }
        }
      })
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false,
      characterDataOldValue: true
    })

    console.log(`👁️  Observer запущен на ${container.tagName}.${container.className}`)

    // Также мониторим iframe если это iframe
    if (container.tagName === 'IFRAME') {
      console.log('🖼️  Это iframe, может потребоваться дополнительная обработка')
    }

  }, chatContainer.element)
}

async function findChatSelectors(page: Page): Promise<string[]> {
  console.log('🔍 Поиск селекторов чата...')

  const foundSelectors: string[] = []

  // Функция для поиска элементов
  const results = await page.evaluate(() => {
    const selectors = []
    const allElements = document.querySelectorAll('*')

    // Ищем по атрибутам
    const attributeSelectors = [
      '*[id*="chat"]',
      '*[class*="chat"]',
      '*[data-testid*="chat"]',
      '*[aria-label*="chat"]',
      '*[aria-label*="Chat"]',
      '*[role="log"]',
      '*[role="feed"]',
      'iframe'
    ]

    for (const selector of attributeSelectors) {
      const elements = document.querySelectorAll(selector)
      if (elements.length > 0) {
        selectors.push({
          selector,
          count: elements.length,
          sample: elements[0].outerHTML.substring(0, 100)
        })
      }
    }

    // Ищем по тексту
    const textElements = Array.from(allElements).filter(el => {
      const text = el.textContent || ''
      return text.toLowerCase().includes('chat') ||
        text.includes(':') ||
        el.tagName === 'IFRAME'
    })

    textElements.slice(0, 10).forEach(el => {
      // Генерируем селектор
      let selector = ''
      if (el.id) {
        selector = `#${el.id}`
      } else if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter(c => c).join('.')
        selector = `.${classes}`
      } else {
        selector = el.tagName.toLowerCase()
      }

      selectors.push({
        selector,
        count: 1,
        sample: el.outerHTML.substring(0, 100)
      })
    })

    return selectors
  })

  // Фильтруем уникальные селекторы
  const uniqueSelectors = Array.from(new Set(results.map(r => r.selector)))

  console.log('Найдены селекторы:', uniqueSelectors)
  return uniqueSelectors
}

// Функция для остановки бота
export async function stopBot(raffleId: string): Promise<void> {
  const raffle = raffles.get(raffleId)
  if (!raffle) return

  console.log(`Stopping bot for raffle ${raffleId}`)
  raffle.active = false

  // Закрываем браузер если он есть
  if (raffle.browser) {
    try {
      await raffle.browser.close()
      console.log('Browser closed')

      // Очищаем ссылки
      delete raffle.browser
      delete raffle.page
    } catch (error) {
      console.error('Error closing browser:', error)
    }
  }

  io.emit('botStopped', { raffleId })
}