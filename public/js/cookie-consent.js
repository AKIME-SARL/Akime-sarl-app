(() => {
  const consentKey = 'akime_cookie_consent_v1';
  let banner;

  function rememberChoice(choice) {
    try {
      localStorage.setItem(consentKey, choice);
    } catch (error) {
      console.warn('Cookie preference could not be saved:', error);
    } finally {
      banner?.remove();
      banner = null;
    }
  }

  function showBanner() {
    if (banner) return;

    banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Préférences de cookies');

    const content = document.createElement('div');
    content.className = 'cookie-banner__content';

    const title = document.createElement('h2');
    title.className = 'cookie-banner__title';
    title.textContent = 'Votre confidentialité compte';

    const description = document.createElement('p');
    description.className = 'cookie-banner__description';
    description.textContent = 'Nous utilisons un stockage local pour mémoriser votre choix. Le site n’utilise actuellement aucun cookie facultatif de mesure d’audience ou de publicité. Le cookie indispensable à la connexion de l’administration reste actif.';

    const policyLink = document.createElement('a');
    policyLink.href = '/mentions-legales.html#cookies';
    policyLink.textContent = 'En savoir plus';

    const actions = document.createElement('div');
    actions.className = 'cookie-banner__actions';

    const refuseButton = document.createElement('button');
    refuseButton.type = 'button';
    refuseButton.className = 'cookie-banner__button cookie-banner__button--secondary';
    refuseButton.textContent = 'Refuser';
    refuseButton.addEventListener('click', () => rememberChoice('refused'));

    const acceptButton = document.createElement('button');
    acceptButton.type = 'button';
    acceptButton.className = 'cookie-banner__button cookie-banner__button--primary';
    acceptButton.textContent = 'Accepter';
    acceptButton.addEventListener('click', () => rememberChoice('accepted'));

    content.append(title, description, policyLink);
    actions.append(refuseButton, acceptButton);
    banner.append(content, actions);
    document.body.append(banner);
  }

  let choice;
  try {
    choice = localStorage.getItem(consentKey);
  } catch (error) {
    console.warn('Cookie preference could not be read:', error);
  }

  if (choice !== 'accepted' && choice !== 'refused') showBanner();

  document.querySelectorAll('[data-cookie-preferences]').forEach(control => {
    control.addEventListener('click', showBanner);
  });
})();
