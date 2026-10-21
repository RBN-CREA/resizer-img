export function showVideoStatus(message, type) {
  const bar = document.getElementById('videoStatusBar');
  bar.className = 'status-bar visible ' + type;
  document.getElementById('videoStatusText').textContent = message;
}

export function hideVideoStatus() {
  document.getElementById('videoStatusBar').className = 'status-bar';
}
