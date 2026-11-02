(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('entra-sign-in');
    var status = document.getElementById('login-status');

    function show(message, failed) {
      status.textContent = message;
      status.classList.toggle('error', Boolean(failed));
    }

    fetch('/api/auth/session', { cache: 'no-store' }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Sign-in status could not be checked.');
        return data;
      });
    }).then(function (session) {
      if (!session.enabled) window.location.assign('/');
    }).catch(function (error) {
      button.disabled = true;
      show(error.message, true);
    });

    function poll(flowId) {
      fetch('/api/auth/poll?flowId=' + encodeURIComponent(flowId), { cache: 'no-store' }).then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) throw new Error(data.error || 'Sign-in status could not be checked.');
          return data;
        });
      }).then(function (result) {
        if (result.status === 'complete') {
          show('Signed in. Opening the workbench…');
          window.location.assign('/');
        } else if (result.status === 'failed' || result.status === 'expired') {
          button.disabled = false;
          show(result.error || 'The sign-in request expired. Try again.', true);
        } else {
          window.setTimeout(function () { poll(flowId); }, 1500);
        }
      }).catch(function (error) {
        button.disabled = false;
        show(error.message || 'Sign-in could not be completed. Try again.', true);
      });
    }

    button.addEventListener('click', function () {
      button.disabled = true;
      show('Opening Microsoft sign-in in your browser…');
      fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }).then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok || data.ok === false) throw new Error(data.error || 'Sign-in could not be started.');
          return data;
        });
      }).then(function (result) {
        poll(result.flowId);
      }).catch(function (error) {
        button.disabled = false;
        show(error.message || 'Sign-in could not be started. Try again.', true);
      });
    });
  });
})();
