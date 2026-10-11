'use strict';

(() => {
  let installPrompt = null;
  let installing = false;
  let offlineReady = false;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => standalone.matches || navigator.standalone === true;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const supportedOrigin = () => location.protocol === 'https:' || (location.protocol === 'http:' && isLocal);

  function help(message) {
    const target = document.getElementById('installHelp');
    if (target) {
      target.textContent = message;
      target.hidden = !message;
    }
  }

  function updateButton() {
    const button = document.getElementById('installApp');
    if (!button) return;
    button.textContent = isInstalled() ? 'Installed' : 'Install app';
    button.disabled = isInstalled() || installing;
  }

  async function install() {
    if (isInstalled() || installing) return;
    if (!supportedOrigin()) {
      help('Open Daybook using its secure web address to install it.');
      return;
    }
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      installing = true;
      updateButton();
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        help(choice.outcome === 'accepted' ? '' : 'You can install Daybook later from this button.');
      } catch {
        help('Use your browser menu, then Install app or Add to Home Screen.');
      } finally {
        installing = false;
        updateButton();
      }
      return;
    }
    if (isIOS()) {
      help('In Safari: Share → Add to Home Screen → turn on Open as Web App if shown → Add.');
    } else {
      help('Open your browser menu → Install app or Add to Home Screen.');
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateButton();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    help('Daybook was added to your apps.');
    updateButton();
  });
  standalone.addEventListener?.('change', updateButton);

  function announceReady() {
    offlineReady = true;
    window.dispatchEvent(new CustomEvent('daybook:pwa-ready'));
  }

  async function register() {
    if (!('serviceWorker' in navigator) || !supportedOrigin()) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      if (registration.active) announceReady();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'activated') announceReady();
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('daybook:update-ready'));
          }
        });
      });
      // Never skipWaiting or reload here: a new version waits for open windows
      // to close, preserving any capture or inline edit currently in progress.
    } catch {
      window.dispatchEvent(new CustomEvent('daybook:pwa-unavailable'));
    }
  }

  function start() {
    document.getElementById('installApp')?.addEventListener('click', install);
    updateButton();
    register();
  }

  window.DaybookPWA = Object.freeze({ install, get installed() { return isInstalled(); }, get offlineReady() { return offlineReady; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
