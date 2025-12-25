
// ===== ЛОГИКА РОЗЫГРЫШЕЙ =====

let activeRaffles = [];

// Инициализация форм розыгрыша
function initRaffleForms() {
  const raffleTypeSelect = document.getElementById('raffleType');
  const simpleFields = document.getElementById('simple-raffle-fields');
  const chatFields = document.getElementById('chat-raffle-fields');

  if (raffleTypeSelect) {
    raffleTypeSelect.addEventListener('change', () => {
      const type = raffleTypeSelect.value;
      simpleFields.style.display = type === 'simple' ? 'block' : 'none';
      chatFields.style.display = type === 'chat' ? 'block' : 'none';
    });
  }

  // Создание розыгрыша
  const createBtn = document.getElementById('createRaffleBtn');
  if (createBtn) {
    createBtn.addEventListener('click', createRaffle);
  }
}

// Инициализация формы поиска
function initSearchForm() {
  const searchBtn = document.getElementById('searchRaffleBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', searchRaffle);
  }

  const joinBtn = document.getElementById('joinRaffleBtn');
  if (joinBtn) {
    joinBtn.addEventListener('click', joinRaffle);
  }

  const copyBtn = document.getElementById('copyRaffleIdBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyRaffleId);
  }
}

// Создание розыгрыша
async function createRaffle() {
  const title = document.getElementById('raffleTitle').value.trim();
  const description = document.getElementById('raffleDescription').value.trim();
  const type = document.getElementById('raffleType').value;
  const streamLink = document.getElementById('streamLink')?.value.trim() || '';
  const codeWord = document.getElementById('codeWord')?.value.trim() || '';
  const platform = document.getElementById('platform')?.value || '';

  // Валидация
  if (!title) {
    Utils.showNotification('Введите название розыгрыша', 'error');
    return;
  }

  if (!type) {
    Utils.showNotification('Выберите тип розыгрыша', 'error');
    return;
  }

  if (type === 'chat' && (!streamLink || !codeWord)) {
    Utils.showNotification('Для розыгрыша в чате заполните все поля', 'error');
    return;
  }

  try {
    const raffleData = { title, description, type, streamLink, codeWord, platform };
    const token = localStorage.getItem('accessToken');

    const response = await fetch('http://localhost:3000/raffle/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`
      },
      body: JSON.stringify(raffleData)
    });

    if (response.ok) {
      const data = await response.json();
      Utils.showNotification(`✅ Розыгрыш создан! ID: ${data.id}`, 'success');
      clearCreateForm();
      Tabs.switchTab('active');
    } else {
      const error = await response.json();
      Utils.showNotification(`❌ Ошибка: ${error.error || 'Не удалось создать розыгрыш'}`, 'error');
    }
  } catch (error) {
    console.error('Error creating raffle:', error);
    Utils.showNotification('❌ Ошибка сети или сервера', 'error');
  }
}

// Поиск розыгрыша
async function searchRaffle() {
  const raffleId = document.getElementById('searchRaffleId').value.trim();

  if (!raffleId) {
    Utils.showNotification('Введите идентификатор розыгрыша', 'error');
    return;
  }

  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`http://localhost:3000/raffle/${raffleId}`, {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      displayFoundRaffle(data.raffle);
    } else {
      Utils.showNotification('Розыгрыш не найден', 'error');
      hideFoundRaffle();
    }
  } catch (error) {
    console.error('Error searching raffle:', error);
    Utils.showNotification('❌ Ошибка сети', 'error');
  }
}

// Участие в розыгрыше
async function joinRaffle() {
  const raffleId = document.getElementById('foundRaffleId')?.textContent;
  if (!raffleId) return;

  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`http://localhost:3000/raffle/${raffleId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    });

    if (response.ok) {
      Utils.showNotification('✅ Вы успешно присоединились к розыгрышу!', 'success');
    } else {
      const error = await response.json();
      Utils.showNotification(`❌ ${error.error || 'Не удалось присоединиться'}`, 'error');
    }
  } catch (error) {
    console.error('Error joining raffle:', error);
    Utils.showNotification('❌ Ошибка сети', 'error');
  }
}

// Копирование ID розыгрыша
async function copyRaffleId() {
  const raffleId = document.getElementById('foundRaffleId')?.textContent;
  if (!raffleId) return;

  const success = await Utils.copyToClipboard(raffleId);
  if (success) {
    Utils.showNotification('✅ ID скопирован в буфер обмена', 'success');
  } else {
    Utils.showNotification('❌ Не удалось скопировать', 'error');
  }
}

// Загрузка активных розыгрышей
async function loadActiveRaffles() {
  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch('http://localhost:3000/raffles/my', {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    });

    const container = document.getElementById('activeRafflesContainer');
    if (!container) return;

    if (response.ok) {
      const data = await response.json();
      activeRaffles = data.raffles || [];
      displayActiveRaffles(activeRaffles);
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Ошибка загрузки</h3>
          <p>Не удалось загрузить список розыгрышей</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading active raffles:', error);
    const container = document.getElementById('activeRafflesContainer');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Ошибка сети</h3>
          <p>Проверьте подключение к серверу</p>
        </div>
      `;
    }
  }
}

// Отображение активных розыгрышей
function displayActiveRaffles(raffles) {
  const container = document.getElementById('activeRafflesContainer');
  if (!container) return;

  if (raffles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-gift"></i>
        <h3>Нет активных розыгрышей</h3>
        <p>Создайте первый розыгрыш или найдите существующий, чтобы принять участие.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="raffle-grid">
      ${raffles.map(raffle => `
        <div class="raffle-preview">
          <div class="raffle-status ${raffle.active ? 'status-active' : 'status-finished'}">
            ${raffle.active ? 'Активен' : 'Завершен'}
          </div>
          <h3 style="color: var(--text-primary); margin-bottom: 15px;">
            ${raffle.title || 'Без названия'}
          </h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9rem;">
            ${raffle.description || 'Нет описания'}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--accent-secondary);">
              <i class="fas fa-users"></i> ${raffle.participantCount || 0} участников
            </span>
            <button class="btn-select" data-id="${raffle.id}">
              <i class="fas fa-eye"></i> Подробнее
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Добавляем обработчики кнопок "Подробнее"
  container.querySelectorAll('.btn-select').forEach(btn => {
    btn.addEventListener('click', () => {
      const raffleId = btn.dataset.id;
      document.getElementById('searchRaffleId').value = raffleId;
      Tabs.switchTab('find');
      setTimeout(() => document.getElementById('searchRaffleBtn').click(), 100);
    });
  });
}

// Отображение найденного розыгрыша
function displayFoundRaffle(raffle) {
  const resultCard = document.getElementById('raffleSearchResult');
  if (!resultCard) return;

  document.getElementById('foundRaffleTitle').textContent = raffle.title || 'Без названия';
  document.getElementById('foundRaffleId').textContent = raffle.id;
  document.getElementById('foundRaffleCreator').textContent = raffle.owner || 'Неизвестно';
  document.getElementById('foundRaffleParticipants').textContent = raffle.participantCount || 0;
  document.getElementById('foundRaffleDate').textContent = Utils.formatDate(raffle.createdAt);
  document.getElementById('foundRaffleCodeWord').textContent = raffle.codeWord || 'Не требуется';

  const streamLink = document.getElementById('foundRaffleStreamLink');
  if (streamLink) {
    streamLink.href = raffle.streamLink || '#';
  }

  const statusElement = document.getElementById('foundRaffleStatus');
  if (statusElement) {
    statusElement.textContent = raffle.active ? 'Активен' : 'Завершен';
    statusElement.className = `raffle-status ${raffle.active ? 'status-active' : 'status-finished'}`;
  }

  resultCard.classList.remove('hidden');
}

// Скрытие найденного розыгрыша
function hideFoundRaffle() {
  const resultCard = document.getElementById('raffleSearchResult');
  if (resultCard) {
    resultCard.classList.add('hidden');
  }
}

// Очистка формы создания
function clearCreateForm() {
  const elements = [
    'raffleTitle',
    'raffleDescription',
    'raffleType',
    'streamLink',
    'codeWord',
    'platform'
  ];

  elements.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });

  const simpleFields = document.getElementById('simple-raffle-fields');
  const chatFields = document.getElementById('chat-raffle-fields');
  if (simpleFields) simpleFields.style.display = 'none';
  if (chatFields) chatFields.style.display = 'none';
}

// Экспорт
window.Raffle = {
  initRaffleForms,
  initSearchForm,
  createRaffle,
  searchRaffle,
  joinRaffle,
  copyRaffleId,
  loadActiveRaffles,
  displayActiveRaffles,
  displayFoundRaffle,
  hideFoundRaffle,
  clearCreateForm,
  getActiveRaffles: () => activeRaffles
};