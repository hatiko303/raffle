// ===== УПРАВЛЕНИЕ ВКЛАДКАМИ =====

let currentTab = 'create';

// Инициализация вкладок
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      switchTab(tabId);
    });
  });
}

// Переключение вкладки
function switchTab(tabId) {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  // Убираем активный класс у всех кнопок и контента
  tabButtons.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));

  // Добавляем активный класс выбранной кнопке и контенту
  const activeButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
  const activeContent = document.getElementById(`tab-${tabId}`);

  if (activeButton && activeContent) {
    activeButton.classList.add('active');
    activeContent.classList.add('active');
    currentTab = tabId;

    // Вызываем события при переключении
    onTabSwitch(tabId);
  }
}

// События при переключении вкладки
function onTabSwitch(tabId) {
  console.log(`Переключена вкладка: ${tabId}`);

  switch (tabId) {
    case 'active':
      window.Raffle.loadActiveRaffles();
      break;
    case 'profile':
      Auth.loadProfileData();
      break;
    case 'create':
      initRaffleForms();
      break;
    case 'find':
      initSearchForm();
      break;
  }
}

// Экспорт
window.Tabs = {
  initTabs,
  switchTab,
  getCurrentTab: () => currentTab
};