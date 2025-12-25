// ===== УТИЛИТЫ =====

// Уведомления
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 30px;
    right: 30px;
    background: rgba(16, 18, 27, 0.95);
    backdrop-filter: blur(20px);
    padding: 20px 30px;
    border-radius: 15px;
    border-left: 4px solid ${type === 'success' ? '#00ff88' : type === 'error' ? '#ff4757' : type === 'warning' ? '#ffaa00' : '#00f5ff'};
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 400px;
    word-wrap: break-word;
  `;

  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 15px;">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"
        style="color: ${type === 'success' ? '#00ff88' : type === 'error' ? '#ff4757' : type === 'warning' ? '#ffaa00' : '#00f5ff'}; font-size: 1.2rem;">
      </i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out forwards';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Анимации
function addAnimations() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Валидация
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

// Форматирование
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Копирование в буфер
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Copy error:', error);
    return false;
  }
}

// Дебаунс
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Экспорт
window.Utils = {
  showNotification,
  addAnimations,
  validateEmail,
  validatePassword,
  formatDate,
  copyToClipboard,
  debounce
};