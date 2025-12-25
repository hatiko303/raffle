// ===== АУТЕНТИФИКАЦИЯ =====

let currentUser = null;

// Проверка аутентификации
async function checkAuthentication() {
  console.log('🔄 Проверка аутентификации...');

  // Временная простая проверка
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    console.log('❌ Пользователь не найден в localStorage');

    const justLoggedIn = localStorage.getItem('justLoggedIn');
    if (justLoggedIn === 'true') {
      console.log('✅ Пользователь только что вошел, разрешаем доступ');
      localStorage.removeItem('justLoggedIn');
      return true;
    }

    console.log('🔒 Перенаправляем на страницу входа');
    window.location.href = 'login.html';
    return false;
  }

  try {
    const user = JSON.parse(userStr);
    console.log('✅ Пользователь найден:', user.username);
    currentUser = user;
    return true;
  } catch (error) {
    console.error('❌ Ошибка парсинга пользователя:', error);
    window.location.href = 'login.html';
    return false;
  }
}

// Загрузка данных профиля
// Загрузка данных профиля
function loadProfileData() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  if (user.id) {
    // Безопасно обновляем элементы если они существуют
    const profileUsername = document.getElementById('profileUsername');
    const profileEmail = document.getElementById('profileEmail');
    const profileCreatedAt = document.getElementById('profileCreatedAt');

    if (profileUsername) {
      profileUsername.textContent = user.username || 'Неизвестно';
    }

    if (profileEmail) {
      profileEmail.textContent = user.email || 'Не указано';
    }

    if (profileCreatedAt) {
      profileCreatedAt.textContent = user.createdAt ?
        Utils.formatDate(user.createdAt) : 'Неизвестно';
    }

    currentUser = user;
    console.log('✅ Данные профиля загружены:', user.username);
  } else {
    console.warn('⚠️ Пользователь не найден в localStorage');
  }
}

// Выход из системы
async function logout() {
  try {
    const token = localStorage.getItem('accessToken');
    if (token) {
      await fetch('http://localhost:3000/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  }

  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  localStorage.removeItem('justLoggedIn');
  window.location.href = 'login.html';
}

// Экспорт
window.Auth = {
  checkAuthentication,
  loadProfileData,
  logout,
  getCurrentUser: () => currentUser
};