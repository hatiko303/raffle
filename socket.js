// ===== WEB SOCKET =====

let socket = null;

// Инициализация WebSocket
// Инициализация WebSocket
function initWebSocket() {
  if (typeof io === 'function') {
    console.log('🔄 Инициализация WebSocket...');

    const token = localStorage.getItem('accessToken');
    console.log('WebSocket token:', token ? 'Есть' : 'Нет');

    // Если нет токена, не подключаемся к WebSocket
    if (!token) {
      console.log('⚠️ Нет токена, WebSocket не подключается');
      return;
    }

    socket = io('http://localhost:3000', {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling']
    });

    setupSocketEvents();
  } else {
    console.error('❌ socket.io не загружен!');
  }
}

// Настройка обработчиков событий
function setupSocketEvents() {
  if (!socket) return;

  socket.on('connect', () => {
    console.log('✅ WebSocket подключен');
    Utils.showNotification('Соединение установлено', 'success');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ WebSocket ошибка подключения:', error.message);

    // Если ошибка аутентификации, обновляем токен и переподключаемся
    if (error.message.includes('Authentication required') ||
      error.message.includes('Invalid token')) {
      console.log('🔄 Ошибка аутентификации, обновляем токен...');

      // Удаляем старый токен
      localStorage.removeItem('accessToken');

      // Пробуем получить новый через /auth/me
      refreshTokenAndReconnect();
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 WebSocket отключен:', reason);
    if (reason === 'io server disconnect') {
      Utils.showNotification('Соединение с сервером прервано', 'warning');
    }
  });

  // Розыгрыши
  socket.on('raffleCreated', (data) => {
    Utils.showNotification(`🎉 Новый розыгрыш: ${data.title}`, 'info');
    if (Tabs.getCurrentTab() === 'active') {
      Raffle.loadActiveRaffles();
    }
  });

  socket.on('raffleStarted', (data) => {
    Utils.showNotification(`🚀 Розыгрыш "${data.raffleId}" запущен`, 'success');
  });

  socket.on('raffleStopped', (data) => {
    Utils.showNotification(`🛑 Розыгрыш завершен. Участников: ${data.winnerCount}`, 'warning');
  });

  // Участники
  socket.on('participantJoined', (data) => {
    Utils.showNotification(`🎯 Новый участник: ${data.user}`, 'info');
  });

  socket.on('participantsUpdate', (data) => {
    // Обновляем список участников если нужно
    console.log('Обновление участников:', data);
  });
}

// Функция обновления токена и переподключения
async function refreshTokenAndReconnect() {
  try {
    // Пробуем получить новый токен через запрос к /auth/me
    const response = await fetch('http://localhost:3000/auth/me', {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      if (data.ok && data.user) {
        // Обновляем пользователя
        localStorage.setItem('user', JSON.stringify(data.user));
        console.log('✅ Токен обновлен, переподключаем WebSocket...');

        // Переподключаемся
        if (socket) {
          socket.disconnect();
          setTimeout(() => initWebSocket(), 1000);
        }
      }
    }
  } catch (error) {
    console.error('❌ Ошибка обновления токена:', error);
  }
}

// Отправка события
function emitSocketEvent(event, data) {
  if (socket && socket.connected) {
    socket.emit(event, data);
    return true;
  }
  return false;
}

// Подключение к комнате розыгрыша
function joinRaffleRoom(raffleId) {
  return emitSocketEvent('joinRaffle', raffleId);
}

// Отключение от комнаты
function leaveRaffleRoom(raffleId) {
  return emitSocketEvent('leaveRaffle', raffleId);
}

// Проверка подключения
function isSocketConnected() {
  return socket && socket.connected;
}

// Экспорт
window.Socket = {
  initWebSocket,
  emitSocketEvent,
  joinRaffleRoom,
  leaveRaffleRoom,
  isSocketConnected,
  getSocket: () => socket
};