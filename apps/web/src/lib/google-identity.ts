// Thin wrapper around Google Identity Services' script-loaded global
// (https://accounts.google.com/gsi/client) — there is no npm package for
// this; Google ships it as a script tag by design.
//
// The design has a custom-styled "Continue with Google" button, not
// Google's own rendered button, but GIS's credential flow is most reliable
// when it originates from a real click on a button *it* rendered (Safari's
// popup/tracking-prevention rules in particular are pickier about anything
// else). The standard workaround — and what this does — is to render
// Google's real button into an off-screen container and forward a click
// from our styled button to it, so the user only ever sees our button.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: { type: 'standard' | 'icon' }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let scriptLoadPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google script')));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// Initializes GIS once per clientId and renders its real button into a
// hidden container appended to <body>, returning a function that clicks
// it. Callers trigger sign-in by calling the returned function from their
// own button's onClick — the actual Google UI (an account chooser popup/
// iframe) still comes from Google, only the visible "Continue with
// Google" button in our UI is custom.
export async function triggerGoogleSignIn(
  clientId: string,
  onCredential: (idToken: string) => void,
): Promise<void> {
  await loadGoogleIdentityScript();
  const google = window.google;
  if (!google) {
    throw new Error('Google Identity Services failed to load');
  }

  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
  });

  const hiddenContainer = document.createElement('div');
  hiddenContainer.style.position = 'fixed';
  hiddenContainer.style.top = '-1000px';
  hiddenContainer.style.left = '-1000px';
  document.body.appendChild(hiddenContainer);
  google.accounts.id.renderButton(hiddenContainer, { type: 'standard' });

  // renderButton builds its child (an iframe-backed clickable element)
  // asynchronously — it isn't present on the container synchronously.
  const realButton = await waitForChild(hiddenContainer);
  realButton.click();
  // The container (and Google's iframe inside it) is left in place rather
  // than removed immediately — removing it while the click it just
  // received is still being processed can cancel the flow before Google's
  // callback ever fires. It's off-screen and inert either way.
}

function waitForChild(container: HTMLElement, timeoutMs = 5000): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const existing = container.querySelector<HTMLElement>('div[role="button"]');
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const button = container.querySelector<HTMLElement>('div[role="button"]');
      if (button) {
        observer.disconnect();
        resolve(button);
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Google sign-in button did not render in time'));
    }, timeoutMs);
  });
}
