declare global {
  interface Window {
    MusicKit?: any;
  }
}

let loading: Promise<any> | null = null;

/** Inject MusicKit JS v3 and configure it with our developer token. Resolves the MusicKit instance. */
export function loadMusicKit(developerToken: string): Promise<any> {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const done = async () => {
        try {
          await window.MusicKit.configure({ developerToken, app: { name: 'DJKado', build: '1.0.0' } });
          resolve(window.MusicKit.getInstance());
        } catch (e) {
          reject(e);
        }
      };
      if (window.MusicKit) return void done();
      document.addEventListener('musickitloaded', done, { once: true });
      const s = document.createElement('script');
      s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      s.async = true;
      s.onerror = () => reject(new Error('Failed to load MusicKit JS'));
      document.head.appendChild(s);
    });
    loading.catch(() => (loading = null));
  }
  return loading;
}
