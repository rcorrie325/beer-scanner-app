/**
 * The curated list of beers we want the app to recognise out of the box.
 *
 * This file holds *facts about the beer*, never barcodes. Barcodes are real
 * GTINs and cannot be guessed, so `scripts/build-beer-catalog.mjs` looks each
 * entry up on Open Food Facts and attaches only the codes OFF actually
 * corroborates. Editing this list and re-running that script is how you grow
 * the catalog.
 *
 * Fields:
 *   brand      Brand as we want it displayed.
 *   offBrand   Open Food Facts `brands_tags` slug to search. Defaults to a
 *              slugified `brand`. Set it when OFF files the beer differently.
 *   name       Display name for the beverage row.
 *   keywords   ALL of these must appear in the OFF product name (lowercased,
 *              accents stripped) for a barcode to be accepted. This is the
 *              guard against attaching "Heineken 0.0" codes to "Heineken".
 *   exclude    None of these may appear. Applied on top of the global list.
 *   style      Free text, matches the styles derived from scans.
 *   abv        Percent ABV. Used to *validate* OFF's own figure and as the
 *              fallback when OFF has none — OFF's per-barcode value wins when
 *              present, because ABV varies by market for the same brand.
 *   volumeMl   Fallback serving size when OFF's quantity field is unparseable.
 *
 * Alcohol-free variants are deliberately absent: the app treats 0% as "no data"
 * rather than "no alcohol", so a seeded 0.0 row would read as a broken entry.
 * Those scans fall through to a live lookup, which is the correct behaviour.
 */

/** Never accept a barcode whose product name contains one of these. */
export const GLOBAL_EXCLUDE = [
  "0,0",
  "0.0",
  "0%",
  "sans alcool",
  "alcohol free",
  "alcohol-free",
  "alcoholfree",
  "non alcoholic",
  "non-alcoholic",
  "nonalcoholic",
  "alkoholfrei",
  "analcolica",
  "sin alcohol",
  "zero",
  "n.a.",
];

export const CATALOG = [
  /* ---------------------------------------------------------------- US macro */
  // "budvar" excluded because OFF files the Czech Budweiser Budvar under this
  // brand tag too, and it is a different beer with its own entry below.
  { brand: "Budweiser", name: "Budweiser", keywords: ["budweiser"], exclude: ["light", "select", "bud light", "budvar"], style: "Lager", abv: 5.0, volumeMl: 355 },
  { brand: "Bud Light", offBrand: "bud-light", name: "Bud Light", keywords: ["bud light"], style: "Lager", abv: 4.2, volumeMl: 355 },
  { brand: "Michelob", offBrand: "michelob", name: "Michelob Ultra", keywords: ["ultra"], style: "Lager", abv: 4.2, volumeMl: 355 },
  { brand: "Coors", offBrand: "coors", name: "Coors Light", keywords: ["light"], style: "Lager", abv: 4.2, volumeMl: 355 },
  { brand: "Coors", offBrand: "coors", name: "Coors Banquet", keywords: ["banquet"], style: "Lager", abv: 5.0, volumeMl: 355 },
  { brand: "Miller", offBrand: "miller", name: "Miller Lite", keywords: ["lite"], style: "Lager", abv: 4.2, volumeMl: 355 },
  { brand: "Miller", offBrand: "miller", name: "Miller High Life", keywords: ["high life"], style: "Lager", abv: 4.6, volumeMl: 355 },
  { brand: "Busch", offBrand: "busch", name: "Busch Light", keywords: ["busch", "light"], style: "Lager", abv: 4.1, volumeMl: 355 },
  { brand: "Natural Light", offBrand: "natural-light", name: "Natural Light", keywords: ["natural light"], style: "Lager", abv: 4.2, volumeMl: 355 },
  { brand: "Pabst", offBrand: "pabst", name: "Pabst Blue Ribbon", keywords: ["blue ribbon"], style: "Lager", abv: 4.7, volumeMl: 355 },
  // OFF files this simply as "Yuengling" — the word "Lager" never appears.
  { brand: "Yuengling", name: "Yuengling Traditional Lager", keywords: ["yuengling"], exclude: ["flight", "light"], style: "Amber", abv: 4.5, volumeMl: 355 },
  { brand: "Rolling Rock", offBrand: "rolling-rock", name: "Rolling Rock", keywords: ["rolling rock"], style: "Lager", abv: 4.5, volumeMl: 355 },
  { brand: "Keystone", offBrand: "keystone", name: "Keystone Light", keywords: ["keystone", "light"], style: "Lager", abv: 4.1, volumeMl: 355 },
  { brand: "Lone Star", offBrand: "lone-star", name: "Lone Star", keywords: ["lone star"], style: "Lager", abv: 4.7, volumeMl: 355 },
  { brand: "Genesee", name: "Genesee Beer", keywords: ["genesee"], style: "Lager", abv: 4.5, volumeMl: 355 },
  { brand: "Narragansett", name: "Narragansett Lager", keywords: ["narragansett"], style: "Lager", abv: 5.0, volumeMl: 355 },
  { brand: "Landshark", offBrand: "landshark", name: "Landshark Lager", keywords: ["landshark"], style: "Lager", abv: 4.6, volumeMl: 355 },

  /* ------------------------------------------------------------- Mexico / LatAm */
  { brand: "Corona", name: "Corona Extra", keywords: ["extra"], exclude: ["light", "familiar"], style: "Lager", abv: 4.6, volumeMl: 355 },
  { brand: "Corona", name: "Corona Light", keywords: ["light"], style: "Lager", abv: 4.0, volumeMl: 355 },
  { brand: "Modelo", name: "Modelo Especial", keywords: ["especial"], exclude: ["negra"], style: "Lager", abv: 4.4, volumeMl: 355 },
  { brand: "Modelo", name: "Negra Modelo", keywords: ["negra"], style: "Lager", abv: 5.4, volumeMl: 355 },
  { brand: "Pacifico", name: "Pacifico Clara", keywords: ["pacifico"], style: "Lager", abv: 4.4, volumeMl: 355 },
  // OFF calls it "Cerveza Dos Equis XX"; "Lager Especial" appears nowhere.
  { brand: "Dos Equis", offBrand: "dos-equis", name: "Dos Equis Lager Especial", keywords: ["dos equis"], exclude: ["ambar", "amber"], style: "Lager", abv: 4.2, volumeMl: 355 },
  { brand: "Dos Equis", offBrand: "dos-equis", name: "Dos Equis Ambar", keywords: ["ambar"], style: "Amber", abv: 4.7, volumeMl: 355 },
  { brand: "Tecate", name: "Tecate", keywords: ["tecate"], style: "Lager", abv: 4.5, volumeMl: 355 },
  { brand: "Sol", name: "Sol", keywords: ["sol"], style: "Lager", abv: 4.5, volumeMl: 330 },
  { brand: "Victoria", name: "Victoria", keywords: ["victoria"], style: "Lager", abv: 4.0, volumeMl: 355 },
  { brand: "Presidente", name: "Presidente", keywords: ["presidente"], style: "Lager", abv: 5.0, volumeMl: 355 },
  { brand: "Red Stripe", offBrand: "red-stripe", name: "Red Stripe", keywords: ["red stripe"], style: "Lager", abv: 4.7, volumeMl: 330 },

  /* -------------------------------------------------------- Northern Europe lager */
  { brand: "Heineken", name: "Heineken", keywords: ["heineken"], exclude: ["silver", "light"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Amstel", name: "Amstel Light", keywords: ["light"], style: "Lager", abv: 3.5, volumeMl: 330 },
  { brand: "Grolsch", name: "Grolsch Premium Pilsner", keywords: ["grolsch"], style: "Pilsner", abv: 5.0, volumeMl: 330 },
  { brand: "Bavaria", name: "Bavaria Premium", keywords: ["bavaria"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Carlsberg", name: "Carlsberg Pilsner", keywords: ["carlsberg"], style: "Pilsner", abv: 5.0, volumeMl: 330 },
  { brand: "Tuborg", name: "Tuborg", keywords: ["tuborg"], style: "Lager", abv: 4.6, volumeMl: 330 },
  { brand: "Kronenbourg", name: "Kronenbourg 1664", keywords: ["1664"], exclude: ["blanc"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Kronenbourg", name: "Kronenbourg 1664 Blanc", keywords: ["blanc"], style: "Wheat", abv: 5.0, volumeMl: 330 },
  { brand: "Stella Artois", offBrand: "stella-artois", name: "Stella Artois", keywords: ["stella"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Jupiler", name: "Jupiler", keywords: ["jupiler"], style: "Lager", abv: 5.2, volumeMl: 330 },
  { brand: "Beck's", offBrand: "beck-s", name: "Beck's", keywords: ["beck"], style: "Pilsner", abv: 5.0, volumeMl: 330 },
  { brand: "Bitburger", name: "Bitburger Premium Pils", keywords: ["bitburger"], style: "Pilsner", abv: 4.8, volumeMl: 330 },
  { brand: "Warsteiner", name: "Warsteiner Premium Verum", keywords: ["warsteiner"], style: "Pilsner", abv: 4.8, volumeMl: 330 },
  { brand: "Krombacher", name: "Krombacher Pils", keywords: ["krombacher"], exclude: ["weizen", "radler"], style: "Pilsner", abv: 4.8, volumeMl: 330 },
  { brand: "Jever", name: "Jever Pilsener", keywords: ["jever"], style: "Pilsner", abv: 4.9, volumeMl: 330 },
  { brand: "Radeberger", name: "Radeberger Pilsner", keywords: ["radeberger"], style: "Pilsner", abv: 4.8, volumeMl: 330 },
  { brand: "Paulaner", name: "Paulaner Hefe-Weissbier", keywords: ["hefe"], style: "Wheat", abv: 5.5, volumeMl: 500 },
  { brand: "Erdinger", name: "Erdinger Weissbier", keywords: ["erdinger"], exclude: ["alkoholfrei"], style: "Wheat", abv: 5.3, volumeMl: 500 },
  { brand: "Weihenstephaner", name: "Weihenstephaner Hefeweissbier", keywords: ["hefe"], style: "Wheat", abv: 5.4, volumeMl: 500 },
  { brand: "Franziskaner", name: "Franziskaner Weissbier", keywords: ["franziskaner"], style: "Wheat", abv: 5.0, volumeMl: 500 },
  { brand: "Hofbräu", offBrand: "hofbrau", name: "Hofbräu Original", keywords: ["original"], style: "Lager", abv: 5.1, volumeMl: 500 },
  { brand: "Spaten", name: "Spaten Münchner Hell", keywords: ["spaten"], style: "Lager", abv: 5.2, volumeMl: 500 },
  { brand: "Löwenbräu", offBrand: "lowenbrau", name: "Löwenbräu Original", keywords: ["original"], style: "Lager", abv: 5.2, volumeMl: 500 },
  { brand: "Augustiner", name: "Augustiner Lagerbier Hell", keywords: ["hell"], style: "Lager", abv: 5.2, volumeMl: 500 },
  { brand: "Pilsner Urquell", offBrand: "pilsner-urquell", name: "Pilsner Urquell", keywords: ["urquell"], style: "Pilsner", abv: 4.4, volumeMl: 330 },
  { brand: "Budweiser Budvar", offBrand: "budweiser-budvar", name: "Budweiser Budvar Original", keywords: ["budvar"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Staropramen", name: "Staropramen Premium", keywords: ["staropramen"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Żywiec", offBrand: "zywiec", name: "Żywiec", keywords: ["zywiec"], style: "Lager", abv: 5.6, volumeMl: 500 },
  { brand: "Tyskie", name: "Tyskie Gronie", keywords: ["tyskie"], style: "Lager", abv: 5.2, volumeMl: 500 },

  /* ----------------------------------------------------------- Southern Europe */
  { brand: "Peroni", name: "Peroni Nastro Azzurro", keywords: ["nastro"], style: "Lager", abv: 5.1, volumeMl: 330 },
  { brand: "Birra Moretti", offBrand: "birra-moretti", name: "Birra Moretti", keywords: ["moretti"], style: "Lager", abv: 4.6, volumeMl: 330 },
  { brand: "Estrella Damm", offBrand: "estrella-damm", name: "Estrella Damm", keywords: ["estrella"], style: "Lager", abv: 4.6, volumeMl: 330 },
  { brand: "Estrella Galicia", offBrand: "estrella-galicia", name: "Estrella Galicia Especial", keywords: ["especial"], style: "Lager", abv: 5.5, volumeMl: 330 },
  { brand: "Mahou", name: "Mahou Cinco Estrellas", keywords: ["cinco estrellas"], style: "Lager", abv: 5.5, volumeMl: 330 },
  { brand: "San Miguel", offBrand: "san-miguel", name: "San Miguel Especial", keywords: ["especial"], style: "Lager", abv: 5.4, volumeMl: 330 },
  { brand: "Cruzcampo", name: "Cruzcampo", keywords: ["cruzcampo"], style: "Lager", abv: 4.8, volumeMl: 330 },
  { brand: "Super Bock", offBrand: "super-bock", name: "Super Bock", keywords: ["super bock"], style: "Lager", abv: 5.2, volumeMl: 330 },
  { brand: "Sagres", name: "Sagres", keywords: ["sagres"], style: "Lager", abv: 5.0, volumeMl: 330 },

  /* -------------------------------------------------------------- UK & Ireland */
  { brand: "Guinness", name: "Guinness Draught", keywords: ["draught"], style: "Stout", abv: 4.2, volumeMl: 440 },
  { brand: "Guinness", name: "Guinness Extra Stout", keywords: ["extra stout"], style: "Stout", abv: 5.6, volumeMl: 330 },
  { brand: "Murphy's", offBrand: "murphy-s", name: "Murphy's Irish Stout", keywords: ["stout"], style: "Stout", abv: 4.0, volumeMl: 440 },
  { brand: "Smithwick's", offBrand: "smithwick-s", name: "Smithwick's Irish Ale", keywords: ["smithwick"], style: "Amber", abv: 4.5, volumeMl: 330 },
  { brand: "Harp", name: "Harp Lager", keywords: ["harp"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Kilkenny", name: "Kilkenny Irish Cream Ale", keywords: ["kilkenny"], style: "Amber", abv: 4.3, volumeMl: 440 },
  { brand: "Newcastle", offBrand: "newcastle", name: "Newcastle Brown Ale", keywords: ["brown ale"], style: "Brown Ale", abv: 4.7, volumeMl: 550 },
  { brand: "Boddingtons", name: "Boddingtons Pub Ale", keywords: ["boddingtons"], style: "Brown Ale", abv: 4.6, volumeMl: 440 },
  { brand: "Fuller's", offBrand: "fuller-s", name: "Fuller's London Pride", keywords: ["london pride"], style: "Brown Ale", abv: 4.7, volumeMl: 500 },
  { brand: "Bass", name: "Bass Pale Ale", keywords: ["bass"], style: "Pale Ale", abv: 5.1, volumeMl: 330 },
  { brand: "Old Speckled Hen", offBrand: "old-speckled-hen", name: "Old Speckled Hen", keywords: ["speckled hen"], style: "Brown Ale", abv: 5.0, volumeMl: 500 },
  { brand: "Carling", name: "Carling", keywords: ["carling"], style: "Lager", abv: 4.0, volumeMl: 440 },
  { brand: "BrewDog", offBrand: "brewdog", name: "BrewDog Punk IPA", keywords: ["punk"], style: "IPA", abv: 5.4, volumeMl: 330 },

  /* -------------------------------------------------------------- Asia-Pacific */
  { brand: "Asahi", name: "Asahi Super Dry", keywords: ["super dry"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Sapporo", name: "Sapporo Premium Beer", keywords: ["premium"], style: "Lager", abv: 4.9, volumeMl: 355 },
  { brand: "Kirin", name: "Kirin Ichiban", keywords: ["ichiban"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Tsingtao", name: "Tsingtao", keywords: ["tsingtao"], style: "Lager", abv: 4.7, volumeMl: 330 },
  { brand: "Tiger", name: "Tiger Beer", keywords: ["tiger"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Singha", name: "Singha", keywords: ["singha"], style: "Lager", abv: 5.0, volumeMl: 330 },
  { brand: "Chang", name: "Chang", keywords: ["chang"], style: "Lager", abv: 5.0, volumeMl: 320 },
  { brand: "Foster's", offBrand: "foster-s", name: "Foster's Lager", keywords: ["foster"], style: "Lager", abv: 4.0, volumeMl: 440 },
  { brand: "Victoria Bitter", offBrand: "victoria-bitter", name: "Victoria Bitter", keywords: ["victoria bitter"], style: "Lager", abv: 4.9, volumeMl: 375 },

  /* ------------------------------------------------------------------- Belgian */
  { brand: "Hoegaarden", name: "Hoegaarden Witbier", keywords: ["hoegaarden"], exclude: ["rosee", "rosée"], style: "Wheat", abv: 4.9, volumeMl: 330 },
  { brand: "Leffe", name: "Leffe Blonde", keywords: ["blonde"], style: "Belgian", abv: 6.6, volumeMl: 330 },
  { brand: "Leffe", name: "Leffe Brune", keywords: ["brune"], style: "Belgian", abv: 6.5, volumeMl: 330 },
  { brand: "Duvel", name: "Duvel", keywords: ["duvel"], style: "Belgian", abv: 8.5, volumeMl: 330 },
  { brand: "Chimay", name: "Chimay Bleue", keywords: ["bleue"], style: "Belgian", abv: 9.0, volumeMl: 330 },
  { brand: "Chimay", name: "Chimay Rouge", keywords: ["rouge"], style: "Belgian", abv: 7.0, volumeMl: 330 },
  { brand: "Delirium", name: "Delirium Tremens", keywords: ["tremens"], style: "Belgian", abv: 8.5, volumeMl: 330 },
  { brand: "La Chouffe", offBrand: "chouffe", name: "La Chouffe", keywords: ["chouffe"], exclude: ["mc", "houblon"], style: "Belgian", abv: 8.0, volumeMl: 330 },
  { brand: "Westmalle", name: "Westmalle Tripel", keywords: ["tripel"], style: "Belgian", abv: 9.5, volumeMl: 330 },
  { brand: "Orval", name: "Orval", keywords: ["orval"], style: "Belgian", abv: 6.2, volumeMl: 330 },
  { brand: "Rochefort", name: "Rochefort 10", keywords: ["10"], style: "Belgian", abv: 11.3, volumeMl: 330 },
  { brand: "St. Bernardus", offBrand: "st-bernardus", name: "St. Bernardus Abt 12", keywords: ["abt"], style: "Belgian", abv: 10.0, volumeMl: 330 },
  { brand: "Affligem", name: "Affligem Blond", keywords: ["blond"], style: "Belgian", abv: 6.7, volumeMl: 330 },
  { brand: "Tripel Karmeliet", offBrand: "tripel-karmeliet", name: "Tripel Karmeliet", keywords: ["karmeliet"], style: "Belgian", abv: 8.4, volumeMl: 330 },
  { brand: "Lindemans", name: "Lindemans Framboise", keywords: ["framboise"], style: "Sour", abv: 2.5, volumeMl: 250 },

  /* ----------------------------------------------------------------- US craft */
  { brand: "Sierra Nevada", offBrand: "sierra-nevada", name: "Sierra Nevada Pale Ale", keywords: ["pale ale"], exclude: ["hazy", "torpedo"], style: "Pale Ale", abv: 5.6, volumeMl: 355 },
  { brand: "Sierra Nevada", offBrand: "sierra-nevada", name: "Sierra Nevada Hazy Little Thing", keywords: ["hazy little thing"], style: "IPA", abv: 6.7, volumeMl: 355 },
  { brand: "Sierra Nevada", offBrand: "sierra-nevada", name: "Sierra Nevada Torpedo Extra IPA", keywords: ["torpedo"], style: "IPA", abv: 7.2, volumeMl: 355 },
  { brand: "Lagunitas", name: "Lagunitas IPA", keywords: ["ipa"], exclude: ["sumpin", "little", "hazy"], style: "IPA", abv: 6.2, volumeMl: 355 },
  { brand: "Lagunitas", name: "Lagunitas Little Sumpin' Sumpin' Ale", keywords: ["sumpin"], style: "Pale Ale", abv: 7.5, volumeMl: 355 },
  { brand: "Blue Moon", offBrand: "blue-moon", name: "Blue Moon Belgian White", keywords: ["belgian white"], style: "Wheat", abv: 5.4, volumeMl: 355 },
  { brand: "Samuel Adams", offBrand: "samuel-adams", name: "Samuel Adams Boston Lager", keywords: ["boston lager"], style: "Lager", abv: 5.0, volumeMl: 355 },
  { brand: "Samuel Adams", offBrand: "samuel-adams", name: "Samuel Adams Summer Ale", keywords: ["summer ale"], style: "Wheat", abv: 5.3, volumeMl: 355 },
  { brand: "New Belgium", offBrand: "new-belgium", name: "New Belgium Fat Tire", keywords: ["fat tire"], style: "Amber", abv: 5.2, volumeMl: 355 },
  { brand: "Voodoo Ranger", offBrand: "voodoo-ranger", name: "Voodoo Ranger IPA", keywords: ["ipa"], exclude: ["juicy", "imperial", "juice force"], style: "IPA", abv: 7.0, volumeMl: 355 },
  { brand: "Voodoo Ranger", offBrand: "voodoo-ranger", name: "Voodoo Ranger Juicy Haze IPA", keywords: ["juicy haze"], style: "IPA", abv: 7.5, volumeMl: 355 },
  { brand: "Founders", name: "Founders All Day IPA", keywords: ["all day"], style: "IPA", abv: 4.7, volumeMl: 355 },
  { brand: "Founders", name: "Founders Breakfast Stout", keywords: ["breakfast stout"], exclude: ["kbs"], style: "Stout", abv: 8.3, volumeMl: 355 },
  { brand: "Bell's", offBrand: "bell-s", name: "Bell's Two Hearted Ale", keywords: ["two hearted"], style: "IPA", abv: 7.0, volumeMl: 355 },
  { brand: "Dogfish Head", offBrand: "dogfish-head", name: "Dogfish Head 60 Minute IPA", keywords: ["60 minute"], style: "IPA", abv: 6.0, volumeMl: 355 },
  { brand: "Dogfish Head", offBrand: "dogfish-head", name: "Dogfish Head 90 Minute IPA", keywords: ["90 minute"], style: "IPA", abv: 9.0, volumeMl: 355 },
  { brand: "Goose Island", offBrand: "goose-island", name: "Goose Island IPA", keywords: ["ipa"], exclude: ["312", "bourbon"], style: "IPA", abv: 5.9, volumeMl: 355 },
  { brand: "Stone", name: "Stone IPA", keywords: ["stone", "ipa"], exclude: ["delicious", "ruination", "hazy"], style: "IPA", abv: 6.9, volumeMl: 355 },
  { brand: "Ballast Point", offBrand: "ballast-point", name: "Ballast Point Sculpin IPA", keywords: ["sculpin"], style: "IPA", abv: 7.0, volumeMl: 355 },
  { brand: "Firestone Walker", offBrand: "firestone-walker", name: "Firestone Walker 805", keywords: ["805"], style: "Pale Ale", abv: 4.7, volumeMl: 355 },
  { brand: "Firestone Walker", offBrand: "firestone-walker", name: "Firestone Walker Union Jack IPA", keywords: ["union jack"], style: "IPA", abv: 7.0, volumeMl: 355 },
  { brand: "Deschutes", name: "Deschutes Black Butte Porter", keywords: ["black butte"], style: "Porter", abv: 5.5, volumeMl: 355 },
  { brand: "Deschutes", name: "Deschutes Fresh Squeezed IPA", keywords: ["fresh squeezed"], style: "IPA", abv: 6.4, volumeMl: 355 },
  { brand: "Shiner", name: "Shiner Bock", keywords: ["bock"], style: "Lager", abv: 4.4, volumeMl: 355 },
  { brand: "Anchor", name: "Anchor Steam Beer", keywords: ["steam"], style: "Amber", abv: 4.9, volumeMl: 355 },
  { brand: "Oskar Blues", offBrand: "oskar-blues", name: "Oskar Blues Dale's Pale Ale", keywords: ["dale"], style: "Pale Ale", abv: 6.5, volumeMl: 355 },
  { brand: "SweetWater", offBrand: "sweetwater", name: "SweetWater 420 Extra Pale Ale", keywords: ["420"], style: "Pale Ale", abv: 5.4, volumeMl: 355 },
  { brand: "Bear Republic", offBrand: "bear-republic", name: "Bear Republic Racer 5 IPA", keywords: ["racer"], style: "IPA", abv: 7.5, volumeMl: 355 },
  { brand: "Kona", name: "Kona Big Wave", keywords: ["big wave"], style: "Pale Ale", abv: 4.4, volumeMl: 355 },
  { brand: "Kona", name: "Kona Longboard Island Lager", keywords: ["longboard"], style: "Lager", abv: 4.6, volumeMl: 355 },
  { brand: "Leinenkugel's", offBrand: "leinenkugel-s", name: "Leinenkugel's Summer Shandy", keywords: ["summer shandy"], style: "Wheat", abv: 4.2, volumeMl: 355 },
  { brand: "Abita", name: "Abita Amber", keywords: ["amber"], style: "Amber", abv: 4.5, volumeMl: 355 },

  /* ------------------------------------------------------- Cider, seltzer, RTD */
  { brand: "Angry Orchard", offBrand: "angry-orchard", name: "Angry Orchard Crisp Apple", keywords: ["crisp apple"], style: "Cider", abv: 5.0, volumeMl: 355 },
  { brand: "Strongbow", name: "Strongbow Original", keywords: ["strongbow"], style: "Cider", abv: 5.0, volumeMl: 440 },
  { brand: "Magners", name: "Magners Original Irish Cider", keywords: ["magners"], style: "Cider", abv: 4.5, volumeMl: 568 },
  { brand: "Bulmers", name: "Bulmers Original", keywords: ["bulmers"], style: "Cider", abv: 4.5, volumeMl: 568 },
  { brand: "Somersby", name: "Somersby Apple Cider", keywords: ["apple"], style: "Cider", abv: 4.5, volumeMl: 330 },
  { brand: "Woodchuck", name: "Woodchuck Amber Hard Cider", keywords: ["amber"], style: "Cider", abv: 5.0, volumeMl: 355 },
  { brand: "White Claw", offBrand: "white-claw", name: "White Claw Hard Seltzer", keywords: ["white claw"], style: "Hard Seltzer", abv: 5.0, volumeMl: 355 },
  { brand: "Truly", name: "Truly Hard Seltzer", keywords: ["truly"], style: "Hard Seltzer", abv: 5.0, volumeMl: 355 },
  { brand: "Twisted Tea", offBrand: "twisted-tea", name: "Twisted Tea Original", keywords: ["twisted tea"], style: "Hard Tea", abv: 5.0, volumeMl: 355 },
  { brand: "Mike's", offBrand: "mike-s", name: "Mike's Hard Lemonade", keywords: ["hard lemonade"], style: "RTD", abv: 5.0, volumeMl: 330 },
  { brand: "Smirnoff", name: "Smirnoff Ice", keywords: ["ice"], style: "RTD", abv: 4.5, volumeMl: 330 },
];
