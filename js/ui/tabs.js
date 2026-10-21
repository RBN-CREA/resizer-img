document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    
    btn.classList.add('active');
    const tabName = btn.dataset.tab;
    if (tabName === 'images') {
      document.getElementById('imageView').classList.add('active');
    } else if (tabName === 'video') {
      document.getElementById('videoView').classList.add('active');
    }
  });
});
