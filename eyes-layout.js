(() => {
  // Eyes and Lips use a 2:1 landscape image (height:width = 1:2) and a matching
  // card height. Font sizes are intentionally left untouched.
  const style = document.createElement("style");
  style.textContent = `
    #eyesPanel .ranking-card,
    #lipsPanel .ranking-card {
      grid-template-columns: 128px minmax(0, 1fr);
      min-height: 64px;
      height: 64px;
    }

    #eyesPanel .ranking-image-button,
    #lipsPanel .ranking-image-button {
      width: 128px;
      height: 64px;
      min-width: 128px;
    }

    #eyesPanel .ranking-card-body,
    #lipsPanel .ranking-card-body {
      padding-top: 8px;
      padding-bottom: 8px;
    }

    @media (max-width: 640px) {
      #eyesPanel .ranking-card,
      #lipsPanel .ranking-card {
        grid-template-columns: 116px minmax(0, 1fr);
        min-height: 58px;
        height: 58px;
      }

      #eyesPanel .ranking-image-button,
      #lipsPanel .ranking-image-button {
        width: 116px;
        height: 58px;
        min-width: 116px;
      }

      #eyesPanel .ranking-card-body,
      #lipsPanel .ranking-card-body {
        padding-top: 5px;
        padding-bottom: 5px;
      }
    }
  `;
  document.head.appendChild(style);
})();
