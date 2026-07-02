(function () {
  function openShell(src, options) {
    const popup = window.open('about:blank', '_blank');
    if (!popup) return false;
    const escape = function (value) {
      return String(value || '').replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    };
    const title = options && options.title ? escape(String(options.title).slice(0, 100)) : '';
    const favicon = options && options.favicon ? '<link rel="icon" href="' + escape(options.favicon) + '">' : '';
    const shell = '<!DOCTYPE html><html><head><title>' + title + '</title>' + favicon +
      '<style>*{margin:0;padding:0}html,body,iframe{display:block;width:100%;height:100%;border:0;overflow:hidden}</style>' +
      '</he' + 'ad><body><iframe referrerpolicy="no-referrer" src="' + escape(src) + '"></iframe></bo' + 'dy></html>';
    popup.document.write(shell);
    popup.document.close();
    return true;
  }

  window.__bardoLaunchAboutBlank = openShell;

  try {
    const settings = JSON.parse(localStorage.getItem('bardo-settings') || '{}');
    if (!settings.aboutBlankMode || window !== window.top || sessionStorage.getItem('bardo-ab')) return;
    sessionStorage.setItem('bardo-ab', '1');
    const cloaks = {
      canvas: ['Dashboard - Canvas', 'https://www.google.com/s2/favicons?domain=instructure.com&sz=32'],
      gdrive: ['My Drive - Google Drive', 'https://www.google.com/s2/favicons?domain=drive.google.com&sz=32'],
      canva: ['Home - Canva', 'https://www.google.com/s2/favicons?domain=canva.com&sz=32'],
      classlink: ['ClassLink Launchpad', 'https://www.google.com/s2/favicons?domain=launchpad.classlink.com&sz=32'],
      blooket: ['Blooket', 'https://www.google.com/s2/favicons?domain=blooket.com&sz=32'],
      classroom: ['Google Classroom', 'https://www.google.com/s2/favicons?domain=classroom.google.com&sz=32'],
      docs: ['Untitled document - Google Docs', 'https://www.google.com/s2/favicons?domain=docs.google.com&sz=32']
    };
    const remembered = settings.aboutBlankRememberCloak && cloaks[settings.tabCloak];
    const options = {
      title: settings.aboutBlankTitle || (remembered && remembered[0]) || '',
      favicon: settings.aboutBlankFavicon || (remembered && remembered[1]) || ''
    };
    if (openShell(location.href, options)) window.__bardoAbLaunched = true;
    else window.__bardoAbBlocked = true;
  } catch {}
})();
