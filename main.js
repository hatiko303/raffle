// ===== ГЛАВНАЯ ИНИЦИАЛИЗАЦИЯ =====

// Основная функция инициализации
// Основная функция инициализации
async function initApp() {
  console.log('🚀 Инициализация приложения...');

  // Проверяем аутентификацию
  const isAuthenticated = await Auth.checkAuthentication();
  if (!isAuthenticated) {
    console.log('❌ Приложение не инициализировано: нет аутентификации');
    return;
  }

  // Добавляем анимации
  Utils.addAnimations();

  // Инициализируем компоненты
  Tabs.initTabs();

  // Проверяем существование элементов перед инициализацией
  if (document.getElementById('raffleType')) {
    Raffle.initRaffleForms();
  }

  if (document.getElementById('searchRaffleBtn')) {
    Raffle.initSearchForm();
  }

  Socket.initWebSocket();
  Auth.loadProfileData();

  // Настраиваем обработчики
  setupEventListeners();

  console.log('✅ Приложение успешно инициализировано');
}

// Настройка обработчиков событий
function setupEventListeners() {
  // Выход из системы
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', Auth.logout);
  }

  // Быстрый поиск по Enter
  const searchInput = document.getElementById('searchRaffleId');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('searchRaffleBtn').click();
      }
    });
  }

  // Сброс формы при клике на Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Raffle.clearCreateForm();
    }
  });
}

// Запуск приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', initApp);

// Глобальный обработчик ошибок
window.addEventListener('error', (event) => {
  console.error('Глобальная ошибка:', event.error);
  Utils.showNotification('Произошла ошибка в приложении', 'error');
});

// Экспорт глобальных объектов
window.App = {
  initApp,
  version: '1.0.0'
};