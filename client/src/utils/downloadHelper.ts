/**
 * Utility functions for handling file downloads
 */

export interface DownloadInfo {
  filename: string;
  size: number;
  format: string;
  timestamp: string;
}

/**
 * Shows a notification with download information and location hints
 */
export const showDownloadNotification = (info: DownloadInfo): void => {
  const notification = document.createElement('div');
  notification.className = 'download-notification';
  notification.innerHTML = `
    <div class="download-notification-content">
      <div class="download-icon">📥</div>
      <div class="download-details">
        <h4>Download Complete!</h4>
        <p><strong>${info.filename}</strong></p>
        <p>Size: ${formatFileSize(info.size)} • Format: ${info.format.toUpperCase()}</p>
        <div class="download-location">
          <p><strong>File Location:</strong></p>
          <ul>
            <li><strong>Windows:</strong> Downloads folder or check browser downloads (Ctrl+J)</li>
            <li><strong>Mac:</strong> Downloads folder or check browser downloads (⌘+Shift+J)</li>
            <li><strong>Linux:</strong> Downloads folder or ~/Downloads</li>
          </ul>
        </div>
      </div>
      <button class="close-notification" onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .download-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      max-width: 400px;
      animation: slideInRight 0.3s ease-out;
    }

    .download-notification-content {
      display: flex;
      padding: 1rem;
      gap: 1rem;
      align-items: flex-start;
    }

    .download-icon {
      font-size: 2rem;
      flex-shrink: 0;
    }

    .download-details {
      flex: 1;
    }

    .download-details h4 {
      margin: 0 0 0.5rem 0;
      color: #10b981;
      font-size: 1rem;
    }

    .download-details p {
      margin: 0 0 0.25rem 0;
      font-size: 0.9rem;
      color: #374151;
    }

    .download-location {
      margin-top: 0.75rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .download-location p {
      margin: 0 0 0.5rem 0;
      font-weight: 600;
      color: #374151;
    }

    .download-location ul {
      margin: 0;
      padding-left: 1rem;
      font-size: 0.8rem;
      color: #6b7280;
    }

    .download-location li {
      margin-bottom: 0.25rem;
    }

    .close-notification {
      background: none;
      border: none;
      font-size: 1.2rem;
      color: #9ca3af;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .close-notification:hover {
      background: #f3f4f6;
      color: #374151;
    }

    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @media (max-width: 768px) {
      .download-notification {
        top: 10px;
        right: 10px;
        left: 10px;
        max-width: none;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(notification);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
    if (style.parentNode) {
      style.remove();
    }
  }, 10000);
};

/**
 * Formats file size in human-readable format
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Opens the browser's download manager
 */
export const openDownloadsManager = (): void => {
  // Try to open browser downloads page
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('chrome') || userAgent.includes('chromium')) {
    window.open('chrome://downloads/', '_blank');
  } else if (userAgent.includes('firefox')) {
    window.open('about:downloads', '_blank');
  } else if (userAgent.includes('safari')) {
    // Safari doesn't have a direct downloads page, show instruction
    alert('To view downloads in Safari:\n1. Press ⌘+Option+L\n2. Or go to View > Show Downloads');
  } else {
    // Generic instruction
    alert(
      'To view downloads:\n• Press Ctrl+J (Windows/Linux)\n• Press ⌘+Shift+J (Mac)\n• Or check your browser menu',
    );
  }
};
