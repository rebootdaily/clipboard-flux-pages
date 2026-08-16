/* Clipboard-Flux responsive viewport layout -- Milestone 23.2.
   Keeps the existing phone and desktop presentation intact while giving
   touch tablets (including iPad mini) substantially better use of the live
   viewport. The layout is based on measured browser space, not device model
   or hard-coded iPad dimensions, so portrait/landscape, Safari chrome and the
   on-screen keyboard can all change the available height dynamically. */
(function () {
  'use strict';

  if (window.__clipboardFluxResponsiveLayoutLoaded) return;
  window.__clipboardFluxResponsiveLayoutLoaded = true;

  var STYLE_ID = 'clipboard-flux-responsive-layout-style';
  var TABLET_QUERY = '(min-width: 700px) and (max-width: 1366px) and (hover: none) and (pointer: coarse)';
  var root = document.documentElement;
  var tabletQuery = window.matchMedia ? window.matchMedia(TABLET_QUERY) : null;
  var updateFrame = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      ':root{' +
        '--cf-viewport-height:100vh;' +
        '--cf-app-chrome-height:0px;' +
      '}' +
      'body.cf-responsive-tablet main{' +
        'width:100%;' +
        'max-width:1100px;' +
        'padding-left:max(16px,env(safe-area-inset-left));' +
        'padding-right:max(16px,env(safe-area-inset-right));' +
      '}' +
      'body.cf-responsive-tablet #screen{' +
        'display:flex;' +
        'flex-direction:column;' +
        'min-height:max(0px,calc(var(--cf-viewport-height) - var(--cf-app-chrome-height) - 24px - env(safe-area-inset-bottom)));' +
      '}' +
      'body.cf-responsive-tablet #screen>.bottom-nav{' +
        'margin-top:auto;' +
      '}' +
      'body.cf-responsive-tablet .notes-text-area{' +
        'flex:1 1 auto;' +
      '}' +
      '@media (orientation:landscape){' +
        'body.cf-responsive-tablet main{' +
          'max-width:1180px;' +
          'padding-left:max(20px,env(safe-area-inset-left));' +
          'padding-right:max(20px,env(safe-area-inset-right));' +
        '}' +
      '}';
    document.head.appendChild(style);
  }

  function viewportHeight() {
    if (window.visualViewport && window.visualViewport.height) {
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function appChromeHeight() {
    return ['body > header', '#inspection-bar', '#tabs'].reduce(function (total, selector) {
      var el = document.querySelector(selector);
      if (!el) return total;
      var rect = el.getBoundingClientRect();
      return total + Math.max(0, rect.height || 0);
    }, 0);
  }

  function isTouchTablet() {
    return tabletQuery ? tabletQuery.matches : false;
  }

  function updateNow() {
    updateFrame = null;
    if (!document.body) return;

    document.body.classList.toggle('cf-responsive-tablet', isTouchTablet());
    root.style.setProperty('--cf-viewport-height', Math.max(0, viewportHeight()) + 'px');
    root.style.setProperty('--cf-app-chrome-height', Math.max(0, appChromeHeight()) + 'px');
  }

  function scheduleUpdate() {
    if (updateFrame !== null) return;
    var raf = window.requestAnimationFrame || function (callback) {
      return window.setTimeout(callback, 16);
    };
    updateFrame = raf(updateNow);
  }

  function observeChrome() {
    if (typeof ResizeObserver === 'undefined') return;

    var observer = new ResizeObserver(scheduleUpdate);
    ['body > header', '#inspection-bar', '#tabs'].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) observer.observe(el);
    });
  }

  ensureStyle();
  observeChrome();

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleUpdate, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
    window.visualViewport.addEventListener('scroll', scheduleUpdate, { passive: true });
  }

  if (tabletQuery) {
    if (tabletQuery.addEventListener) {
      tabletQuery.addEventListener('change', scheduleUpdate);
    } else if (tabletQuery.addListener) {
      tabletQuery.addListener(scheduleUpdate);
    }
  }

  scheduleUpdate();
})();
