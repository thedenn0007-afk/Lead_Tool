(() => {
  function nowIso() {
    return new Date().toISOString();
  }

  window.track = function track(event, props = {}) {
    try {
      const payload = {
        event,
        page: location.pathname.split('/').pop() || 'index.html',
        at: nowIso(),
        ...props,
      };

      window.leadtoolEvents = window.leadtoolEvents || [];
      window.leadtoolEvents.push(payload);

      if (window.gtag && window.LEADTOOL_GA_MEASUREMENT_ID) {
        window.gtag('event', event, payload);
      }
    } catch (error) {}
  };
})();
