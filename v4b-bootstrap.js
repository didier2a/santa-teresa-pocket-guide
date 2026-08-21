(() => {
  const PHOTO = {
    piazza: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_di_Gallura%2C_piazza_Vittorio_Emanuele_I.jpg?width=960',
      credit: 'Basilicofresco · Wikimedia Commons · CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Santa_Teresa_di_Gallura,_piazza_Vittorio_Emanuele_I.jpg'
    },
    rena: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rena_Bianca_Beach%2C_Santa_Teresa_Gallura.jpg?width=960',
      credit: 'Or kriminal · Wikimedia Commons · CC BY-SA 3.0',
      page: 'https://commons.wikimedia.org/wiki/File:Rena_Bianca_Beach,_Santa_Teresa_Gallura.jpg'
    },
    torre: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Torre_di_Longonsardo%2C_Santa_Teresa_di_Gallura.jpg?width=960',
      credit: 'Basilicofresco · Wikimedia Commons · CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Torre_di_Longonsardo,_Santa_Teresa_di_Gallura.jpg'
    },
    modesto: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_Gallura_-_Piazza_Vittorio_Emanuele_I_%2802%29.JPG?width=960',
      credit: 'Gianni Careddu · Wikimedia Commons · CC BY-SA 3.0',
      page: 'https://commons.wikimedia.org/wiki/File:Santa_Teresa_Gallura_-_Piazza_Vittorio_Emanuele_I_(02).JPG'
    },
    faro: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_Testa.JPG?width=960',
      credit: 'LPLT · Wikimedia Commons · CC BY-SA 3.0',
      page: 'https://commons.wikimedia.org/wiki/File:Capo_Testa.JPG'
    },
    francese: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Santa_Teresa_Gallura_-_Capo_Testa_%2826%29.JPG?width=960',
      credit: 'Gianni Careddu · Wikimedia Commons',
      page: 'https://commons.wikimedia.org/wiki/File:Santa_Teresa_Gallura_-_Capo_Testa_(26).JPG'
    },
    luna: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Valle_della_Luna_in_Gallura%2C_Sardegna.jpg?width=960',
      credit: 'Rosalena.disalvo · Wikimedia Commons',
      page: 'https://commons.wikimedia.org/wiki/File:Valle_della_Luna_in_Gallura,_Sardegna.jpg'
    },
    brandali: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lu_Brandali.jpg?width=960',
      credit: 'Photo2023 · Wikimedia Commons · CC BY 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Lu_Brandali.jpg'
    },
    panorama: {
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Capo_di_testa.jpg?width=960',
      credit: 'Tobias Helfrich · Wikimedia Commons',
      page: 'https://commons.wikimedia.org/wiki/File:Capo_di_testa.jpg'
    }
  };
  window.V4B_PHOTOS = PHOTO;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (!requestUrl.includes('data/trip.json')) return response;
    try {
      const data = await response.clone().json();
      for (const place of data.places || []) {
        const photo = PHOTO[place.id];
        if (!photo) continue;
        place.heroImage = photo.image;
        place.gallery = [photo.image];
        place.photoCredit = photo.credit;
        place.photoPage = photo.page;
      }
      for (const item of data.discover || []) {
        if (PHOTO[item.placeId]) item.image = PHOTO[item.placeId].image;
      }
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: {'Content-Type': 'application/json; charset=utf-8'}
      });
    } catch {
      return response;
    }
  };
})();
