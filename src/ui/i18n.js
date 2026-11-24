// UI Internationalization (i18n): Supports multilingual localization.
// LANG comes from config.js (default 'en'). t(key, vars) returns localized string.
// bodyName(entry) returns localized celestial name. applyDomI18n() handles static HTML text.

import { LANG } from '../config.js';
export { LANG };

const D = {
  'tgt.ephemMeasured': { zh: 'Orbit: interpolated JPL ephemeris', en:'Orbit: interpolated JPL ephemeris', es:'Órbita: efemérides JPL interpoladas', ja: 'Orbit: interpolated JPL ephemeris', fr:'Orbite : éphémérides JPL interpolées', de:'Bahn: interpolierte JPL-Ephemeriden', ru:'Орбита: интерполяция эфемерид JPL' },
  'tgt.ephemApprox': { zh: 'Orbit: approximate model (JPL calibration unavailable at this time)', en:'Orbit: approximate model (JPL calibration unavailable at this time)', es:'Órbita: modelo aproximado (sin calibración JPL para esta fecha)', ja: 'Orbit: approximate model (JPL calibration unavailable at this time)', fr:'Orbite : modèle approché (sans calibration JPL à cette date)', de:'Bahn: Näherungsmodell (keine JPL-Kalibrierung für diesen Zeitpunkt)', ru:'Орбита: приближённая модель (нет калибровки JPL для этой даты)' },
  // ── （HUD ）────────────────────────────────────────────────
  'u.year':   { zh: 'yr',   en: 'yr',  es: 'a',    ja: 'yr',     fr: 'an',   de: 'J',    ru: 'г' },
  'u.month':  { zh: 'mo',   en: 'mo',  es: 'mes',  ja: 'mo',     fr: 'mois', de: 'Mo',   ru: 'мес' },
  'u.week':   { zh: 'wk',   en: 'wk',  es: 'sem',  ja: 'wk',     fr: 'sem',  de: 'Wo',   ru: 'нед' },
  'u.day':    { zh: 'd',   en: 'd',   es: 'd',    ja: 'd',     fr: 'j',    de: 'T',    ru: 'д' },
  'u.hour':   { zh: 'h', en: 'h',   es: 'h',    ja: 'h',   fr: 'h',    de: 'Std',  ru: 'ч' },
  'u.min':    { zh: 'min', en: 'min', es: 'min',  ja: 'min',     fr: 'min',  de: 'Min',  ru: 'мин' },
  'u.days':   { zh: 'd',   en: 'd',   es: 'd',    ja: 'd',     fr: 'j',    de: 'T',    ru: 'д' },
  'u.years':  { zh: 'yr',   en: 'yr',  es: 'a',    ja: 'yr',     fr: 'ans',  de: 'J',    ru: 'лет' },
  'u.hours':  { zh: 'h', en: 'h',   es: 'h',    ja: 'h',   fr: 'h',    de: 'Std',  ru: 'ч' },
  'u.ms':     { zh: 'ms', en: 'ms',  es: 'ms',   ja: 'ms',  fr: 'ms',   de: 'ms',   ru: 'мс' },
  'u.sec':    { zh: 's',   en: 's',   es: 's',    ja: 's',     fr: 's',    de: 's',    ru: 'с' },
  'u.perSec': { zh: '/s',  en: '/s',  es: '/s',   ja: '/s',    fr: '/s',   de: '/s',   ru: '/с' },
  'u.ly':     { zh: 'ly', en: 'ly',  es: 'al',   ja: 'ly',   fr: 'al',   de: 'Lj',   ru: 'св.год' },

  // ──  ─────────────────────────────────────────────────────────
  'time.paused': { zh: '⏸ Paused', en: '⏸ Paused', es: '⏸ En pausa', ja: '⏸ Paused', fr: '⏸ En pause', de: '⏸ Pausiert', ru: '⏸ Пауза' },
  'time.realtime': { zh: '1× (real-time)', en: '1× (real-time)', es: '1× (tiempo real)', ja: '1×（リアルタイム）', fr: '1× (temps réel)', de: '1× (Echtzeit)', ru: '1× (реальное время)' },
  'time.rate': { zh: 'Time warp', en: 'Time warp', es: 'Velocidad temporal', ja: 'タイムワープ', fr: 'Accélération temporelle', de: 'Zeitraffer', ru: 'Ускорение времени' },
  'time.k.minus': { zh: 'slower', en: 'slower', es: 'más lento', ja: 'slower', fr: 'plus lent', de: 'langsamer', ru: 'медленнее' },
  'time.k.plus': { zh: 'faster', en: 'faster', es: 'más rápido', ja: 'faster', fr: 'plus vite', de: 'schneller', ru: 'быстрее' },
  'time.k.pause': { zh: 'pause', en: 'pause', es: 'pausa', ja: 'pause', fr: 'pause', de: 'Pause', ru: 'пауза' },
  'time.k.now': { zh: 'now', en: 'now', es: 'ahora', ja: 'now', fr: 'maintenant', de: 'jetzt', ru: 'сейчас' },
  'time.outOfRange': {
    zh: '⚠ Beyond high-precision ephemeris range (1800–2050)',
    en: '⚠ Outside high-accuracy ephemeris range (1800–2050)',
    es: '⚠ Fuera del rango de efemérides de alta precisión (1800–2050)',
    ja: '',
    fr: '⚠ Hors de la plage d\'éphémérides de haute précision (1800–2050)',
    de: '⚠ Außerhalb des hochpräzisen Ephemeridenbereichs (1800–2050)',
    ru: '⚠ Вне диапазона высокоточных эфемерид (1800–2050)',
  },

  // ──  ─────────────────────────────────────────────────────────
  'nav.flight': { zh: '✈ Flying', en: '✈ Flying', es: '✈ Volando', ja: '✈ Flying', fr: '✈ En vol', de: '✈ Flug', ru: '✈ Полёт' },
  'nav.orbit': {
    zh: '🌐 Explore (drag, scroll, double-click to travel)',
    en: '🌐 Explore (drag · scroll · double-click to fly)',
    es: '🌐 Explorar (arrastrar · desplazar · doble clic para volar)',
    ja: '',
    fr: '🌐 Explorer (glisser · molette · double-clic pour voler)',
    de: '🌐 Erkunden (ziehen · scrollen · Doppelklick zum Fliegen)',
    ru: '🌐 Исследование (перетаскивание · прокрутка · двойной клик для полёта)',
  },
  'nav.walk': { zh: '🚶 Surface walk', en: '🚶 Surface walk', es: '🚶 Caminar en superficie', ja: '🚶 Surface walk', fr: '🚶 Marche en surface', de: '🚶 Oberflächenbegehung', ru: '🚶 Ходьба по поверхности' },
  'nav.fly': { zh: '🚀 Free flight', en: '🚀 Free flight', es: '🚀 Vuelo libre', ja: '🚀 Free flight', fr: '🚀 Vol libre', de: '🚀 Freier Flug', ru: '🚀 Свободный полёт' },
  'nav.goingTo': { zh: 'To {name}', en: 'To {name}', es: 'Hacia {name}', ja: '{name}へ', fr: 'Vers {name}', de: 'Nach {name}', ru: 'К {name}' },
  'nav.orbiting': { zh: 'Orbiting: {name}', en: 'Orbiting: {name}', es: 'Orbitando: {name}', ja: 'Orbiting: {name}', fr: 'En orbite : {name}', de: 'Umlaufbahn: {name}', ru: 'На орбите: {name}' },
  'nav.speed': { zh: 'Speed {v}', en: 'Speed {v}', es: 'Velocidad {v}', ja: 'Speed {v}', fr: 'Vitesse {v}', de: 'Geschwindigkeit {v}', ru: 'Скорость {v}' },
  'nav.gear': { zh: '　gear {v} (scroll)', en: '　gear {v} (scroll)', es: '　marcha {v} (rueda)', ja: '　ギア {v}（スクロール）', fr: '　rapport {v} (molette)', de: '　Gang {v} (Scrollen)', ru: '　передача {v} (прокрутка)' },
  'nav.nearest': { zh: 'Nearest: {name}　alt {alt}', en: 'Nearest: {name}　alt {alt}', es: 'Más cercano: {name}　alt {alt}', ja: 'Nearest: {name}　alt {alt}', fr: 'Plus proche : {name}　alt {alt}', de: 'Nächster: {name}　Höhe {alt}', ru: 'Ближайший: {name}　выс. {alt}' },
  'nav.gravity': { zh: 'Surface gravity {g} m/s²', en: 'Surface gravity {g} m/s²', es: 'Gravedad superficial {g} m/s²', ja: 'Surface gravity {g} m/s²', fr: 'Gravité de surface {g} m/s²', de: 'Oberflächengravitation {g} m/s²', ru: 'Гравитация на поверхности {g} m/s²' },
  'nav.hintFly': { zh: 'Free flight', en: 'Free flight', es: 'Vuelo libre', ja: 'Free flight', fr: 'Vol libre', de: 'Freier Flug', ru: 'Свободный полёт' },
  'nav.hintGoto': { zh: 'Go to selected', en: 'Go to selected', es: 'Ir al seleccionado', ja: 'Go to selected', fr: 'Aller à la sélection', de: 'Zum Ausgewählten', ru: 'К выбранному' },

  // ──  ─────────────────────────────────────────────────────
  'tgt.none': {
    zh: 'No target selected — click label to select, double-click/search/directory to travel<br>Number keys 1-9/0 to visit planets',
    en: 'No target — click a label to select; double-click/search/directory to fly<br>Keys 1-9/0 jump to planets',
    es: 'Sin objetivo — clic en una etiqueta para seleccionar; doble clic/búsqueda/directorio para volar<br>Teclas 1-9/0 saltan a planetas',
    ja: '',
    fr: 'Pas de cible — cliquez sur une étiquette pour sélectionner ; double-clic/recherche/annuaire pour voler<br>Touche 1-9/0 = planètes',
    de: 'Kein Ziel — Etikett klicken zum Auswählen; Doppelklick/Suche/Verzeichnis zum Fliegen<br>Tasten 1-9/0 springen zu Planeten',
    ru: 'Нет цели — кликните по метке для выбора; двойной клик/поиск/каталог для полёта<br>Клавиши 1-9/0 — к планетам',
  },
  'tgt.dist': { zh: 'Distance {d}　<span class="dim">light-time {lt}</span>', en: 'Distance {d}　<span class="dim">light-time {lt}</span>', es: 'Distancia {d}　<span class="dim">tiempo de luz {lt}</span>', ja: 'Distance {d}　<span class="dim">light-time {lt}</span>', fr: 'Distance {d}　<span class="dim">temps de lumière {lt}</span>', de: 'Entfernung {d}　<span class="dim">Lichtzeit {lt}</span>', ru: 'Расстояние {d}　<span class="dim">световое время {lt}</span>' },
  'tgt.dSun': { zh: 'From Sun {au} AU', en: 'From Sun {au} AU', es: 'Del Sol {au} AU', ja: 'From Sun {au} AU', fr: 'Du Soleil {au} UA', de: 'Von der Sonne {au} AE', ru: 'От Солнца {au} а.е.' },
  'tgt.radius': { zh: 'Radius {r} km', en: 'Radius {r} km', es: 'Radio {r} km', ja: 'Radius {r} km', fr: 'Rayon {r} km', de: 'Radius {r} km', ru: 'Радиус {r} км' },
  'tgt.gravity': { zh: 'Surface gravity {g} m/s²', en: 'Surface gravity {g} m/s²', es: 'Gravedad superficial {g} m/s²', ja: 'Surface gravity {g} m/s²', fr: 'Gravité de surface {g} m/s²', de: 'Oberflächengravitation {g} m/s²', ru: 'Гравитация на поверхности {g} m/s²' },
  'tgt.period': { zh: 'Orbital period {p}', en: 'Orbital period {p}', es: 'Período orbital {p}', ja: 'Orbital period {p}', fr: 'Période orbitale {p}', de: 'Umlaufperiode {p}', ru: 'Период обращения {p}' },
  'tgt.rotation': { zh: 'Rotation period {p}', en: 'Rotation period {p}', es: 'Período de rotación {p}', ja: 'Rotation period {p}', fr: 'Période de rotation {p}', de: 'Rotationsperiode {p}', ru: 'Период вращения {p}' },
  'tgt.fact': { zh: '📚 <b>Did you know</b>　', en: '📚 <b>Did you know</b>　', es: '📚 <b>¿Sabías que?</b>　', ja: '📚 <b>Did you know</b>　', fr: '📚 <b>Le saviez-vous ?</b>　', de: '📚 <b>Wusstest du schon?</b>　', ru: '📚 <b>Знаете ли вы?</b>　' },
  'tgt.factNext': { zh: 'Another ↻', en: 'Another ↻', es: 'Otra ↻', ja: 'Another ↻', fr: 'Une autre ↻', de: 'Eine andere ↻', ru: 'Ещё ↻' },
  'tgt.goto': { zh: '<span class="key">T</span> Fly there', en: '<span class="key">T</span> Fly there', es: '<span class="key">T</span> Volar allí', ja: '<span class="key">T</span> Fly there', fr: '<span class="key">T</span> Y voler', de: '<span class="key">T</span> Dorthin fliegen', ru: '<span class="key">T</span> Лететь туда' },

  // ── （tips）──────────────────────────────────────────────────────
  'tip.quality': { zh: 'Quality lowered automatically for smooth performance', en: 'Quality lowered automatically for smooth performance', es: 'Calidad reducida automáticamente para un rendimiento fluido', ja: 'Quality lowered automatically for smooth performance', fr: 'Qualité réduite automatiquement pour des performances fluides', de: 'Qualität automatisch gesenkt für flüssige Leistung', ru: 'Качество автоматически снижено для плавной работы' },
  'hud.dv': { zh: 'Δv remaining {v} km/s', en: 'Δv remaining {v} km/s', es: 'Δv restante {v} km/s', ja: 'Δv remaining {v} km/s', fr: 'Δv restant {v} km/s', de: 'Δv verbleibend {v} km/s', ru: 'Остаток Δv {v} км/с' },
  'tip.terrainLoading': { zh: 'Terrain is still loading — try again in a moment', en: 'Terrain is still loading — try again in a moment', es: 'El terreno aún se está cargando', ja: 'Terrain is still loading — try again in a moment', fr: 'Le terrain est en cours de chargement', de: 'Gelände wird noch geladen', ru: 'Рельеф ещё загружается' },
  'tip.compareOn': { zh: 'Earth–Moon scale comparison: ON', en: 'Earth–Moon scale comparison: ON', es: 'Comparación de escala: ON', ja: 'Earth–Moon scale comparison: ON', fr: 'Comparaison d’échelle : ON', de: 'Größenvergleich: AN', ru: 'Сравнение масштабов: ВКЛ' },
  'tip.compareOff': { zh: 'Earth–Moon scale comparison: OFF', en: 'Earth–Moon scale comparison: OFF', es: 'Comparación de escala: OFF', ja: 'Earth–Moon scale comparison: OFF', fr: 'Comparaison d’échelle : OFF', de: 'Größenvergleich: AUS', ru: 'Сравнение масштабов: ВЫКЛ' },
  'tip.starsUnavailable': { zh: 'Star catalog failed to load — sky reduced to a synthetic background', en: 'Star catalog failed to load — sky reduced to a synthetic background', es: 'No se pudo cargar el catálogo estelar', ja: 'Star catalog failed to load — sky reduced to a synthetic background', fr: 'Échec du chargement du catalogue stellaire', de: 'Sternkatalog konnte nicht geladen werden', ru: 'Не удалось загрузить каталог звёзд' },
  'tip.tnoOrbitsOn': { zh: 'Trans-Neptunian orbits: ON', en: 'Trans-Neptunian orbits: ON', es: 'Órbitas transneptunianas: ON', ja: 'Trans-Neptunian orbits: ON', fr: 'Orbites transneptuniennes : ON', de: 'Transneptunische Orbits: AN', ru: 'Орбиты транснептуновых объектов: ВКЛ' },
  'tip.tnoOrbitsOff': { zh: 'Trans-Neptunian orbits: OFF', en: 'Trans-Neptunian orbits: OFF', es: 'Órbitas transneptunianas: OFF', ja: 'Trans-Neptunian orbits: OFF', fr: 'Orbites transneptuniennes : OFF', de: 'Transneptunische Orbits: AUS', ru: 'Орбиты транснептуновых объектов: ВЫКЛ' },
  'tip.cinematicOn': { zh: '🎬 Clean mode: all overlays hidden (press Z again to restore)', en: '🎬 Clean mode: all overlays hidden (press Z again to restore)', es: '🎬 Modo limpio: interfaz oculta (pulsa Z para volver)', ja: '🎬 Clean mode: all overlays hidden (press Z again to restore)', fr: '🎬 Mode épuré : interface masquée (Z pour revenir)', de: '🎬 Sauberer Modus: alle Overlays aus (Z zum Zurückholen)', ru: '🎬 Чистый режим: интерфейс скрыт (Z — вернуть)' },
  'tip.cinematicOff': { zh: 'Overlays restored', en: 'Overlays restored', es: 'Interfaz restaurada', ja: 'Overlays restored', fr: 'Interface restaurée', de: 'Overlays wieder an', ru: 'Интерфейс восстановлен' },
  'tip.pendingFocus': {
    zh: '🎯 Target selected: {name} (scroll or PageUp/Down to approach/recede)',
    en: '🎯 Target set: {name} (scroll or PageUp/Down to approach/recede)',
    es: '🎯 Objetivo fijado: {name} (desplazar o RePág/AvPág para acercar/alejar)',
    ja: '',
    fr: '🎯 Cible définie : {name} (molette ou PagePréc/Suiv pour approcher/s\'éloigner)',
    de: '🎯 Ziel gesetzt: {name} (scrollen oder BildAuf/Ab zum Nähern/Entfernen)',
    ru: '🎯 Цель установлена: {name} (прокрутка или PageUp/Down для приближения/отдаления)',
  },
  'tip.lockedFocus': {
    zh: '🎯 Focus locked: {name} (scroll close to land directly)',
    en: '🎯 Focus locked: {name} (scroll in to land directly)',
    es: '🎯 Enfoque bloqueado: {name} (desplazar para aterrizar directamente)',
    ja: '',
    fr: '🎯 Cible verrouillée : {name} (molette pour atterrir directement)',
    de: '🎯 Fokus gesperrt: {name} (reinzoomen zum direkten Landen)',
    ru: '🎯 Фокус захвачен: {name} (прокрутка к себе для прямой посадки)',
  },
  'tip.flyingTo': { zh: '✈ Flying to {name}… (drag to cancel)', en: '✈ Flying to {name}… (drag to cancel)', es: '✈ Volando hacia {name}… (arrastrar para cancelar)', ja: '✈ Flying to {name}… (drag to cancel)', fr: '✈ En vol vers {name}… (glisser pour annuler)', de: '✈ Flug nach {name}… (ziehen zum Abbrechen)', ru: '✈ Полёт к {name}… (перетаскивание для отмены)' },
  'tip.lockHint': { zh: 'Click to lock the pointer and aim with the crosshair', en: 'Click to lock the pointer and aim with the crosshair', es: 'Clic para bloquear el puntero y apuntar con la mira', ja: 'Click to lock the pointer and aim with the crosshair', fr: 'Cliquez pour verrouiller le pointeur et viser avec le réticule', de: 'Klicken zum Sperren des Zeigers und Zielen mit dem Fadenkreuz', ru: 'Кликните для захвата курсора и наведения перекрестием' },
  'tip.aimHint': { zh: 'Move the mouse to aim; click to select', en: 'Move the mouse to aim; click to select', es: 'Mueve el ratón para apuntar; clic para seleccionar', ja: 'Move the mouse to aim; click to select', fr: 'Bougez la souris pour viser ; cliquez pour sélectionner', de: 'Maus bewegen zum Zielen; Klick zum Auswählen', ru: 'Двигайте мышь для наведения; клик для выбора' },
  'tip.landHint': { zh: 'Keep scrolling in = land on {name} (or press G to land now)', en: 'Keep scrolling in = land on {name} (or press G to land now)', es: 'Seguir desplazando = aterrizar en {name} (o presiona G para aterrizar ahora)', ja: 'Keep scrolling in = land on {name} (or press G to land now)', fr: 'Continuer à zoomer = atterrir sur {name} (ou G pour atterrir maintenant)', de: 'Weiter reinzoomen = auf {name} landen (oder G für sofortige Landung)', ru: 'Продолжайте прокрутку = посадка на {name} (или G для немедленной посадки)' },
  'tip.landAny': { zh: 'Scroll all the way in to land seamlessly', en: 'Scroll all the way in to land seamlessly', es: 'Desplazar hasta el final para aterrizar sin interrupción', ja: 'Scroll all the way in to land seamlessly', fr: 'Zoomer à fond pour atterrir sans transition', de: 'Ganz reinzoomen für nahtlose Landung', ru: 'Прокрутите до конца для бесшовной посадки' },
  'tip.enterAtmo': { zh: '☁ Entering {name} atmosphere (no solid surface; scroll out to leave)', en: '☁ Entering {name} atmosphere (no solid surface; scroll out to leave)', es: '☁ Entrando en la atmósfera de {name} (sin superficie sólida; desplazar para salir)', ja: '☁ Entering {name} atmosphere (no solid surface; scroll out to leave)', fr: '☁ Entrée dans l\'atmosphère de {name} (pas de surface solide ; molette pour sortir)', de: '☁ Eintritt in {name} Atmosphäre (keine feste Oberfläche; rauszoomen zum Verlassen)', ru: '☁ Вход в атмосферу {name} (нет твёрдой поверхности; прокрутка от себя для выхода)' },
  'tip.gasGiant': { zh: '⚠ Gas/ice giant has no solid surface: you can dive into the atmosphere but not land', en: '⚠ Gas/ice giant has no solid surface: you can dive into the atmosphere but not land', es: '⚠ Gigante gaseoso/de hielo sin superficie sólida: puedes sumergirte en la atmósfera pero no aterrizar', ja: '⚠ Gas/ice giant has no solid surface: you can dive into the atmosphere but not land', fr: '⚠ Géante gazeuse/de glace sans surface solide : plongée dans l\'atmosphère possible, atterrissage impossible', de: '⚠ Gas-/Eisriese ohne feste Oberfläche: Tauchen in die Atmosphäre möglich, keine Landung', ru: '⚠ Газовый/ледяной гигант без твёрдой поверхности: можно погрузиться в атмосферу, но не сесть' },
  'tip.sun': { zh: '⚠ Approaching the Sun: surface 5772 K', en: '⚠ Approaching the Sun: surface 5772 K', es: '⚠ Acercándose al Sol: superficie 5772 K', ja: '⚠ Approaching the Sun: surface 5772 K', fr: '⚠ Approche du Soleil : surface 5772 K', de: '⚠ Annäherung an die Sonne: Oberfläche 5772 K', ru: '⚠ Приближение к Солнцу: поверхность 5772 K' },
  'tip.inertial': {
    zh: '🛰 Inertial view: camera ignores rotation, time warp (] key) to watch {name}\'s moons orbit · V to exit',
    en: '🛰 Inertial view: camera ignores rotation; speed up time (]) to watch {name}\'s moons orbit · V to exit',
    es: '🛰 Vista inercial: la cámara ignora la rotación; acelera el tiempo (]) para ver las lunas de {name} orbitar · V para salir',
    ja: '',
    fr: '🛰 Vue inertielle : la caméra ignore la rotation ; accélérer le temps (]) pour voir les lunes de {name} orbiter · V pour quitter',
    de: '🛰 Inertiale Ansicht: Kamera ignoriert Rotation; Zeit beschleunigen (]) um {name}s Monde zu sehen · V zum Beenden',
    ru: '🛰 Инерционный вид: камера игнорирует вращение; ускорьте время (]) чтобы увидеть спутники {name} · V для выхода',
  },
  'tip.walkLocked': {
    zh: 'Scroll back to take off · G to return · Space jump · Shift sprint · look up at the sky',
    en: 'Scroll back to take off · G to explore · Space jump · Shift run · look up at the sky',
    es: 'Desplazar atrás para despegar · G para explorar · Space saltar · Shift correr · mira al cielo',
    ja: '',
    fr: 'Molette arrière pour décoller · G pour explorer · Espace sauter · Maj courir · regardez le ciel',
    de: 'Rauszoomen zum Abheben · G zum Erkunden · Leertaste Springen · Umschalt Rennen · schau zum Himmel',
    ru: 'Прокрутка от себя для взлёта · G к исследованию · Пробел прыжок · Shift бег · посмотрите на небо',
  },
  'tip.walkUnlocked': {
    zh: 'Click canvas to lock pointer and look around (or drag) · scroll back to take off',
    en: 'Click to lock the pointer and look around (or drag) · scroll back to take off',
    es: 'Clic para bloquear el puntero y mirar alrededor (o arrastrar) · desplazar atrás para despegar',
    ja: '',
    fr: 'Cliquez pour verrouiller le pointeur et regarder autour (ou glisser) · molette arrière pour décoller',
    de: 'Klicken zum Sperren des Zeigers und Umschauen (oder ziehen) · rauszoomen zum Abheben',
    ru: 'Кликните для захвата курсора и осмотра (или перетаскивание) · прокрутка от себя для взлёта',
  },
  'tip.landNear': { zh: 'Keep scrolling in = land on {name} (or press G to land now)', en: 'Keep scrolling in = land on {name} (or press G to land now)', es: 'Seguir desplazando = aterrizar en {name} (o presiona G para aterrizar ahora)', ja: 'Keep scrolling in = land on {name} (or press G to land now)', fr: 'Continuer à zoomer = atterrir sur {name} (ou G pour atterrir maintenant)', de: 'Weiter reinzoomen = auf {name} landen (oder G für sofortige Landung)', ru: 'Продолжайте прокрутку = посадка на {name} (или G для немедленной посадки)' },
  'tip.urlCopied': { zh: '🔗 Link copied to clipboard (Ctrl+L)', en: '🔗 Link copied to clipboard (Ctrl+L)', es: '🔗 Enlace copiado al portapapeles (Ctrl+L)', ja: '🔗 リンクをクリップボードにコピー（Ctrl+L）', fr: '🔗 Lien copié dans le presse-papiers (Ctrl+L)', de: '🔗 Link in die Zwischenablage kopiert (Strg+L)', ru: '🔗 Ссылка скопирована в буфер обмена (Ctrl+L)' },
  'tip.urlUpdated': { zh: '🔗 Address bar updated (Ctrl+L)', en: '🔗 Address bar updated (Ctrl+L)', es: '🔗 Barra de direcciones actualizada (Ctrl+L)', ja: '🔗 Address bar updated (Ctrl+L)', fr: '🔗 Barre d\'adresse mise à jour (Ctrl+L)', de: '🔗 Adressleiste aktualisiert (Strg+L)', ru: '🔗 Адресная строка обновлена (Ctrl+L)' },
  'tip.bookmarkSaved': { zh: '🔖 Bookmark saved: {name} (Ctrl+Shift+B to jump back)', en: '🔖 Bookmark saved: {name} (Ctrl+Shift+B to jump back)', es: '🔖 Marcador guardado: {name}', ja: '🔖 Bookmark saved: {name} (Ctrl+Shift+B to jump back)', fr: '🔖 Signet enregistré : {name}', de: '🔖 Lesezeichen gespeichert: {name}', ru: '🔖 Закладка сохранена: {name}' },
  'tip.bookmarkNone': { zh: '🔖 No bookmarks yet', en: '🔖 No bookmarks yet', es: '🔖 Sin marcadores', ja: '🔖 ブックマークなし', fr: '🔖 Aucun signet', de: '🔖 Keine Lesezeichen', ru: '🔖 Нет закладок' },
  'tip.humanOn': { zh: '🧍 Human scale figure shown (Y to hide)', en: '🧍 Human scale figure shown (Y to hide)', es: '🧍 Figura humana visible (Y)', ja: '🧍 Human scale figure shown (Y to hide)', fr: '🧍 Silhouette humaine affichée (Y)', de: '🧍 Maßstabsfigur eingeblendet (Y)', ru: '🧍 Силуэт для масштаба показан (Y)' },
  'tip.humanOff': { zh: '🧍 Human scale figure hidden', en: '🧍 Human scale figure hidden', es: '🧍 Figura oculta', ja: '🧍 Human scale figure hidden', fr: '🧍 Silhouette masquée', de: '🧍 Ausgeblendet', ru: '🧍 Скрыто' },
  'tip.fov': { zh: '🔭 FOV {deg}° ≈ {mm}mm', en: '🔭 FOV {deg}° ≈ {mm}mm', es: '🔭 FOV {deg}° ≈ {mm}mm', ja: '🔭 FOV {deg}° ≈ {mm}mm', fr: '🔭 FOV {deg}° ≈ {mm}mm', de: '🔭 FOV {deg}° ≈ {mm}mm', ru: '🔭 FOV {deg}° ≈ {mm}mm' },

  // ── HUD  ─────────────────────────────────────────────────────────
  'hud.flightTo': { zh: 'To {name}　{p}%', en: 'To {name}　{p}%', es: 'Hacia {name}　{p}%', ja: '{name}へ　{p}%', fr: 'Vers {name}　{p}%', de: 'Nach {name}　{p}%', ru: 'К {name}　{p}%' },
  'hud.orbitFocus': { zh: 'Orbiting: {name}', en: 'Orbiting: {name}', es: 'Orbitando: {name}', ja: 'Orbiting: {name}', fr: 'En orbite : {name}', de: 'Umlaufbahn: {name}', ru: 'На орбите: {name}' },
  'hud.speed': { zh: 'Speed {v}', en: 'Speed {v}', es: 'Velocidad {v}', ja: 'Speed {v}', fr: 'Vitesse {v}', de: 'Geschwindigkeit {v}', ru: 'Скорость {v}' },
  'hud.gear': { zh: '　gear {v} (scroll)', en: '　gear {v} (scroll)', es: '　marcha {v} (rueda)', ja: '　ギア {v}（スクロール）', fr: '　rapport {v} (molette)', de: '　Gang {v} (Scrollen)', ru: '　передача {v} (прокрутка)' },
  'hud.nearest': { zh: 'Nearest: {name}　alt {alt}', en: 'Nearest: {name}　alt {alt}', es: 'Más cercano: {name}　alt {alt}', ja: 'Nearest: {name}　alt {alt}', fr: 'Plus proche : {name}　alt {alt}', de: 'Nächster: {name}　Höhe {alt}', ru: 'Ближайший: {name}　выс. {alt}' },
  'hud.surfaceGravity': { zh: 'Surface gravity {g} m/s²', en: 'Surface gravity {g} m/s²', es: 'Gravedad superficial {g} m/s²', ja: 'Surface gravity {g} m/s²', fr: 'Gravité de surface {g} m/s²', de: 'Oberflächengravitation {g} m/s²', ru: 'Гравитация на поверхности {g} m/s²' },
  'hud.hintFly': { zh: 'Free flight', en: 'Free flight', es: 'Vuelo libre', ja: 'Free flight', fr: 'Vol libre', de: 'Freier Flug', ru: 'Свободный полёт' },
  'hud.hintGoto': { zh: 'Go to selected', en: 'Go to selected', es: 'Ir al seleccionado', ja: 'Go to selected', fr: 'Aller à la sélection', de: 'Zum Ausgewählten', ru: 'К выбранному' },
  'hud.lightMs': { zh: 'ms', en: 'ms', es: 'ms', ja: 'ms', fr: 'ms', de: 'ms', ru: 'мс' },
  'hud.lightSec': { zh: 's', en: 's', es: 's', ja: 's', fr: 's', de: 's', ru: 'с' },
  'hud.lightMin': { zh: 'min', en: 'min', es: 'min', ja: 'min', fr: 'min', de: 'Min', ru: 'мин' },
  'hud.lightHour': { zh: 'h', en: 'h', es: 'h', ja: 'h', fr: 'h', de: 'Std', ru: 'ч' },

  'word.target': { zh: 'target', en: 'target', es: 'objetivo', ja: 'target', fr: 'cible', de: 'Ziel', ru: 'цель' },

  // ──  /  ──────────────────────────────────────────────────────
  'dir.title': { zh: '🪐 Directory', en: '🪐 Directory', es: '🪐 Directorio', ja: '🪐 Directory', fr: '🪐 Annuaire', de: '🪐 Verzeichnis', ru: '🪐 Каталог' },
  'dir.sub': { zh: 'click to fly', en: 'click to fly', es: 'clic para volar', ja: 'click to fly', fr: 'cliquez pour voler', de: 'Klick zum Fliegen', ru: 'клик для полёта' },
  'grp.star': { zh: '☀️ Stars', en: '☀️ Stars', es: '☀️ Estrellas', ja: '☀️ Stars', fr: '☀️ Étoiles', de: '☀️ Sterne', ru: '☀️ Звёзды' },
  'grp.planet': { zh: '🪐 Planets', en: '🪐 Planets', es: '🪐 Planetas', ja: '🪐 Planets', fr: '🪐 Planètes', de: '🪐 Planeten', ru: '🪐 Планеты' },
  'grp.dwarf': { zh: '🧊 Dwarf planets', en: '🧊 Dwarf planets', es: '🧊 Planetas enanos', ja: '🧊 Dwarf planets', fr: '🧊 Planètes naines', de: '🧊 Zwergplaneten', ru: '🧊 Карликовые планеты' },
  'grp.moon': { zh: '🌙 Moons', en: '🌙 Moons', es: '🌙 Lunas', ja: '🌙 Moons', fr: '🌙 Lunes', de: '🌙 Monde', ru: '🌙 Спутники' },
  'grp.comet': { zh: '☄️ Comets', en: '☄️ Comets', es: '☄️ Cometas', ja: '☄️ Comets', fr: '☄️ Comètes', de: '☄️ Kometen', ru: '☄️ Кометы' },
  'grp.tno': { zh: '🌑 Trans-Neptunian (TNO)', en: '🌑 Trans-Neptunian (TNO)', es: '🌑 Transneptunianos (TNO)', ja: '🌑 Trans-Neptunian (TNO)', fr: '🌑 Transneptuniens (TNO)', de: '🌑 Transneptunische (TNO)', ru: '🌑 Транснептуновые (TNO)' },
  'grp.probe': { zh: '🛰 Probes', en: '🛰 Probes', es: '🛰 Sondas', ja: '🛰 Probes', fr: '🛰 Sondes', de: '🛰 Sonden', ru: '🛰 Зонды' },
  'grp.boundary': { zh: '🌌 Heliosphere edge', en: '🌌 Heliosphere edge', es: '🌌 Borde de la heliosfera', ja: '🌌 Heliosphere edge', fr: '🌌 Bord de l\'héliosphère', de: '🌌 Heliosphärengrenze', ru: '🌌 Граница гелиосферы' },
  'grp.region': { zh: '🪐 Belts & panoramas', en: '🪐 Belts & panoramas', es: '🪐 Cinturones y panoramas', ja: '🪐 Belts & panoramas', fr: '🪐 Ceintures et panoramas', de: '🪐 Gürtel & Panoramen', ru: '🪐 Пояса и панорамы' },
  'kind.star': { zh: 'star', en: 'star', es: 'estrella', ja: 'star', fr: 'étoile', de: 'Stern', ru: 'звезда' },
  'kind.planet': { zh: 'planet', en: 'planet', es: 'planeta', ja: 'planet', fr: 'planète', de: 'Planet', ru: 'планета' },
  'kind.moon': { zh: 'moon', en: 'moon', es: 'luna', ja: 'moon', fr: 'lune', de: 'Mond', ru: 'спутник' },
  'kind.comet': { zh: 'comet', en: 'comet', es: 'cometa', ja: 'comet', fr: 'comète', de: 'Komet', ru: 'комета' },
  'kind.probe': { zh: 'probe', en: 'probe', es: 'sonda', ja: 'probe', fr: 'sonde', de: 'Sonde', ru: 'зонд' },
  'kind.boundary': { zh: 'boundary', en: 'boundary', es: 'frontera', ja: 'boundary', fr: 'frontière', de: 'Grenze', ru: 'граница' },
  'kind.poi': { zh: 'landmark', en: 'landmark', es: 'hito', ja: 'ランドマーク', fr: 'repère', de: 'Wahrzeichen', ru: 'ориентир' },
  'kind.tno': { zh: 'TNO', en: 'TNO', es: 'TNO', ja: 'TNO', fr: 'TNO', de: 'TNO', ru: 'ТНО' },
  'kind.region': { zh: 'region', en: 'region', es: 'región', ja: 'region', fr: 'région', de: 'Region', ru: 'регион' },
  'search.ph': { zh: '🔍 Search bodies…', en: '🔍 Search bodies…', es: '🔍 Buscar…', ja: '🔍 Search bodies…', fr: '🔍 Rechercher…', de: '🔍 Suchen…', ru: '🔍 Поиск…' },
  'search.orbits': { zh: '🛤 Orbit lines', en: '🛤 Orbit lines', es: '🛤 Líneas orbitales', ja: '🛤 Orbit lines', fr: '🛤 Lignes d\'orbite', de: '🛤 Umlaufbahnen', ru: '🛤 Линии орбит' },
  'search.on': { zh: 'shown', en: 'shown', es: 'visible', ja: 'shown', fr: 'affiché', de: 'angezeigt', ru: 'показ.' },
  'search.off': { zh: 'hidden', en: 'hidden', es: 'oculto', ja: 'hidden', fr: 'masqué', de: 'versteckt', ru: 'скрыто' },
  'search.cur': { zh: 'now', en: 'now', es: 'ahora', ja: 'now', fr: 'maintenant', de: 'jetzt', ru: 'сейчас' },
  'search.toggle': { zh: 'click to toggle', en: 'click to toggle', es: 'clic para alternar', ja: 'click to toggle', fr: 'cliquez pour basculer', de: 'Klick zum Umschalten', ru: 'клик для переключения' },

  // ──  ─────────────────────────────────────────────────────────
  'start.sub': {
    zh: '1:1 real-time Solar System · NASA JPL ephemerides · explore freely',
    en: '1:1 real-time solar system · NASA JPL ephemerides recreate the system right now · explore the whole solar system',
    es: 'Sistema solar a escala 1:1 en tiempo real · Efemérides de la NASA JPL recrean el sistema ahora · explora todo el sistema solar',
    ja: '',
    fr: 'Système solaire 1:1 en temps réel · Les éphémérides de la NASA JPL recréent le système maintenant · explorez tout le système solaire',
    de: '1:1-Echtzeit-Sonnensystem · NASA-JPL-Ephemeriden erschaffen das System jetzt · erkunde das ganze Sonnensystem',
    ru: 'Солнечная система 1:1 в реальном времени · Эфемериды NASA JPL воссоздают систему сейчас · исследуйте всю Солнечную систему',
  },
  'start.loading': { zh: 'Loading…', en: 'Loading…', es: 'Cargando…', ja: 'Loading…', fr: 'Chargement…', de: 'Laden…', ru: 'Загрузка…' },
  'start.retryingGpu': { zh: 'Retrying graphics startup…', en: 'Retrying graphics startup…', es: 'Reintentando iniciar gráficos…', ja: 'Retrying graphics startup…', fr: 'Nouvel essai graphique…', de: 'Grafikstart wird wiederholt…', ru: 'Повторный запуск графики…' },
  'start.retryGpu': { zh: 'Try again', en: 'Try again', es: 'Reintentar', ja: 'Try again', fr: 'Réessayer', de: 'Erneut versuchen', ru: 'Попробовать снова' },
  'start.gpuUnavailable': { zh: 'The browser cannot start WebGL2. Check hardware acceleration or restart the browser, then try again.', en: 'The browser cannot start WebGL2. Check hardware acceleration or restart the browser, then try again.', es: 'El navegador no puede iniciar WebGL2. Comprueba la aceleración de hardware o reinicia el navegador y vuelve a intentarlo.', ja: 'The browser cannot start WebGL2. Check hardware acceleration or restart the browser, then try again.', fr: 'WebGL2 ne peut pas démarrer. Vérifiez l’accélération matérielle ou redémarrez le navigateur, puis réessayez.', de: 'WebGL2 kann nicht starten. Prüfen Sie die Hardwarebeschleunigung oder starten Sie den Browser neu und versuchen Sie es erneut.', ru: 'Браузер не может запустить WebGL2. Проверьте аппаратное ускорение или перезапустите браузер и повторите попытку.' },
  'start.loadingTex': { zh: 'Loading real planet textures… {done}/{total}', en: 'Loading real planet textures… {done}/{total}', es: 'Cargando texturas reales de planetas… {done}/{total}', ja: 'Loading real planet textures… {done}/{total}', fr: 'Chargement des textures planétaires réelles… {done}/{total}', de: 'Echte Planetentexturen laden… {done}/{total}', ru: 'Загрузка текстур планет… {done}/{total}' },
  'start.enter': { zh: 'Enter the solar system', en: 'Enter the solar system', es: 'Entrar al sistema solar', ja: 'Enter the solar system', fr: 'Entrer dans le système solaire', de: 'Sonnensystem betreten', ru: 'Войти в Солнечную систему' },
  'hud.hdLoading': { zh: 'Loading HD textures {pct}%', en: 'Loading HD textures {pct}%', es: 'Cargando texturas HD {pct}%', ja: 'Loading HD textures {pct}%', fr: 'Chargement des textures HD {pct}%', de: 'HD-Texturen laden {pct}%', ru: 'Загрузка HD-текстур {pct}%' },
  'start.hint': {
    zh: 'Click canvas to lock pointer · H for controls',
    en: 'Click to lock the pointer after entering · press H for full controls',
    es: 'Clic para bloquear el puntero al entrar · pulsa H para ver los controles completos',
    ja: '',
    fr: 'Cliquez pour verrouiller le pointeur après l\'entrée · H pour les contrôles complets',
    de: 'Klicken zum Sperren des Zeigers nach dem Eintritt · H für alle Steuerelemente',
    ru: 'Кликните для захвата курсора после входа · H для полного руководства',
  },
  'start.hintTouch': {
    zh: 'One-finger drag · pinch to zoom · double-tap label to travel',
    en: 'One-finger rotate · pinch to zoom · double-tap label to fly',
    es: 'Rotar con un dedo · pellizcar para zoom · doble toque en etiqueta para volar',
    ja: '',
    fr: 'Rotation à un doigt · pincer pour zoomer · double-tap sur l\'étiquette pour voler',
    de: 'Mit einem Finger drehen · pinch zum Zoomen · Doppelklick auf Etikett zum Fliegen',
    ru: 'Поворот одним пальцем · щипок для масштаба · двойное касание метки для полёта',
  },
  'start.star': { zh: 'Star on GitHub', en: 'Star on GitHub', es: 'Star en GitHub', ja: 'GitHubでスター', fr: 'Star sur GitHub', de: 'Auf GitHub starren', ru: 'Звезда на GitHub' },
  'tip.gravityOn': { zh: '🛰 Real gravity: thrust adds acceleration only — free-fall and orbit (X clear disabled)', en: '🛰 Real gravity: thrust adds acceleration only — free-fall and orbit (X clear disabled)', es: '🛰 Gravedad real activada', ja: '🛰 Real gravity: thrust adds acceleration only — free-fall and orbit (X clear disabled)', fr: '🛰 Gravité réelle activée', de: '🛰 Echte Gravitation an', ru: '🛰 Реальная гравитация включена' },
  'tip.gravityOff': { zh: '🛰 Back to arcade flight', en: '🛰 Back to arcade flight', es: '🛰 Vuelo arcade', ja: '🛰 Back to arcade flight', fr: '🛰 Vol arcade', de: '🛰 Arcade-Flug', ru: '🛰 Аркадный полёт' },
  'hud.errCount': { zh: '⚠ Runtime errors {n} ({tag}) · click to copy', en: '⚠ Runtime errors {n} ({tag}) · click to copy', es: '⚠ Errores {n} · clic para copiar', ja: '⚠ Runtime errors {n} ({tag}) · click to copy', fr: '⚠ Erreurs {n} · cliquer pour copier', de: '⚠ Laufzeitfehler {n} · klicken zum Kopieren', ru: '⚠ Ошибок {n} · нажмите, чтобы скопировать' },
  'hud.errHint': { zh: 'Main-loop errors were caught; the view may be incomplete', en: 'Main-loop errors were caught; the view may be incomplete', es: 'Errores capturados; la vista puede estar incompleta', ja: 'Main-loop errors were caught; the view may be incomplete', fr: 'Erreurs interceptées ; l’affichage peut être incomplet', de: 'Fehler abgefangen; die Ansicht kann unvollständig sein', ru: 'Ошибки перехвачены; изображение может быть неполным' },
  'hud.errCopied': { zh: 'Error details copied', en: 'Error details copied', es: 'Detalles copiados', ja: 'Error details copied', fr: 'Détails copiés', de: 'Details kopiert', ru: 'Подробности скопированы' },
  'hud.audioOn': { zh: '🔊 Audio on (M to mute)', en: '🔊 Audio on (M to mute)', es: '🔊 Audio activado (M para silenciar)', ja: '🔊 Audio on (M to mute)', fr: '🔊 Son activé (M pour couper)', de: '🔊 Ton an (M zum Stummschalten)', ru: '🔊 Звук вкл (M — выключить)' },
  'hud.audioOff': { zh: '🔇 Audio off (M to enable)', en: '🔇 Audio off (M to enable)', es: '🔇 Audio desactivado (M para activar)', ja: '🔇 Audio off (M to enable)', fr: '🔇 Son coupé (M pour activer)', de: '🔇 Ton aus (M zum Einschalten)', ru: '🔇 Звук выкл (M — включить)' },
  'tip.audioOn': { zh: '🔊 Audio on: engines, reentry, footsteps, vacuum hiss', en: '🔊 Audio on: engines, reentry, footsteps, vacuum hiss', es: '🔊 Audio activado', ja: '🔊 Audio on: engines, reentry, footsteps, vacuum hiss', fr: '🔊 Son activé', de: '🔊 Ton eingeschaltet', ru: '🔊 Звук включён' },
  'tip.audioOff': { zh: '🔇 Audio off', en: '🔇 Audio off', es: '🔇 Audio desactivado', ja: '🔇 Audio off', fr: '🔇 Son coupé', de: '🔇 Ton ausgeschaltet', ru: '🔇 Звук выключен' },
  'help.toggle': { zh: 'Controls (H to close)', en: 'Controls (H to close)', es: 'Controles (H para cerrar)', ja: 'Controls (H to close)', fr: 'Contrôles (H pour fermer)', de: 'Steuerung (H zum Schließen)', ru: 'Управление (H для закрытия)' },

  // ──  ─────────────────────────────────────────────────────
  'tc.menu':      { zh: '☰', en: '☰', es: '☰', ja: '☰', fr: '☰', de: '☰', ru: '☰' },
  'tc.zoomIn':    { zh: '＋', en: '＋', es: '＋', ja: '＋', fr: '＋', de: '＋', ru: '＋' },
  'tc.zoomOut':   { zh: '－', en: '－', es: '－', ja: '－', fr: '－', de: '－', ru: '－' },
  'tc.dir':       { zh: '🎯', en: '🎯', es: '🎯', ja: '🎯', fr: '🎯', de: '🎯', ru: '🎯' },
  'tc.target':    { zh: 'ℹ️', en: 'ℹ️', es: 'ℹ️', ja: 'ℹ️', fr: 'ℹ️', de: 'ℹ️', ru: 'ℹ️' },
  'tc.land':      { zh: '🛬 Land', en: '🛬 Land', es: '🛬 Aterrizar', ja: '🛬 Land', fr: '🛬 Atterrir', de: '🛬 Landen', ru: '🛬 Посадка' },
  'tc.fly':       { zh: '🚀 Fly', en: '🚀 Fly', es: '🚀 Volar', ja: '🚀 Fly', fr: '🚀 Voler', de: '🚀 Fliegen', ru: '🚀 Полёт' },
  'tc.orbit':     { zh: '🌐 Explore', en: '🌐 Explore', es: '🌐 Explorar', ja: '🌐 Explore', fr: '🌐 Explorer', de: '🌐 Erkunden', ru: '🌐 Исслед.' },
  'tc.stop':      { zh: '⏹ Stop', en: '⏹ Stop', es: '⏹ Detener', ja: '⏹ Stop', fr: '⏹ Arrêter', de: '⏹ Stopp', ru: '⏹ Стоп' },
  'tc.goto':      { zh: '✈ Go', en: '✈ Go', es: '✈ Ir', ja: '✈ Go', fr: '✈ Aller', de: '✈ Fliegen', ru: '✈ Лететь' },
  'tc.reset':     { zh: '↺ Reset', en: '↺ Reset', es: '↺ Reiniciar', ja: '↺ リセット', fr: '↺ Réinitialiser', de: '↺ Zurücksetzen', ru: '↺ Сброс' },
  'tc.audio':     { zh: '🔊 Sound', en: '🔊 Sound', es: '🔊 Sonido', ja: '🔊 Sound', fr: '🔊 Son', de: '🔊 Ton', ru: '🔊 Звук' },
  'tc.fly':       { zh: '🚀 Fly', en: '🚀 Fly', es: '🚀 Volar', ja: '🚀 Fly', fr: '🚀 Voler', de: '🚀 Fliegen', ru: '🚀 Лететь' },
  'tc.inertial':  { zh: '🛰 Inertial', en: '🛰 Inertial', es: '🛰 Inercial', ja: '🛰 Inertial', fr: '🛰 Inertiel', de: '🛰 Inertial', ru: '🛰 Инерц.' },
  'tc.jump':      { zh: '↑ Jump', en: '↑ Jump', es: '↑ Saltar', ja: '↑ ジャンプ', fr: '↑ Sauter', de: '↑ Springen', ru: '↑ Прыжок' },
  'tc.ascend':    { zh: '▲', en: '▲', es: '▲', ja: '▲', fr: '▲', de: '▲', ru: '▲' },
  'tc.descend':   { zh: '▼', en: '▼', es: '▼', ja: '▼', fr: '▼', de: '▼', ru: '▼' },
  'tc.sprint':    { zh: '⚡ Run', en: '⚡ Run', es: '⚡ Correr', ja: '⚡ Run', fr: '⚡ Courir', de: '⚡ Rennen', ru: '⚡ Бег' },
  'tc.takeoff':   { zh: '🚀 Takeoff', en: '🚀 Takeoff', es: '🚀 Despegar', ja: '🚀 Takeoff', fr: '🚀 Décoller', de: '🚀 Abheben', ru: '🚀 Взлёт' },
  'tc.warpSlow':  { zh: '⏮ Slower', en: '⏮ Slower', es: '⏮ Más lento', ja: '⏮ Slower', fr: '⏮ Plus lent', de: '⏮ Langsamer', ru: '⏮ Медленнее' },
  'tc.warpFast':  { zh: '⏭ Faster', en: '⏭ Faster', es: '⏭ Más rápido', ja: '⏭ Faster', fr: '⏭ Plus vite', de: '⏭ Schneller', ru: '⏭ Быстрее' },
  'tc.pause':     { zh: '⏸ Pause', en: '⏸ Pause', es: '⏸ Pausa', ja: '⏸ Pause', fr: '⏸ Pause', de: '⏸ Pause', ru: '⏸ Пауза' },
  'tc.now':       { zh: '⏺ Now', en: '⏺ Now', es: '⏺ Ahora', ja: '⏺ Now', fr: '⏺ Maintenant', de: '⏺ Jetzt', ru: '⏺ Сейчас' },
  'tc.orbits':    { zh: '🛤 Orbits', en: '🛤 Orbits', es: '🛤 Órbitas', ja: '🛤 Orbits', fr: '🛤 Orbites', de: '🛤 Orbits', ru: '🛤 Орбиты' },
  'tc.labels':    { zh: '🏷 Labels', en: '🏷 Labels', es: '🏷 Etiquetas', ja: '🏷 ラベル', fr: '🏷 Étiquettes', de: '🏷 Etiketten', ru: '🏷 Метки' },
  'tc.help':      { zh: '❓ Help', en: '❓ Help', es: '❓ Ayuda', ja: '❓ ヘルプ', fr: '❓ Aide', de: '❓ Hilfe', ru: '❓ Справка' },
  'tc.timeTitle': { zh: '⏱ Time', en: '⏱ Time', es: '⏱ Tiempo', ja: '⏱ Time', fr: '⏱ Temps', de: '⏱ Zeit', ru: '⏱ Время' },
  'tc.dispTitle': { zh: '🖥 Display', en: '🖥 Display', es: '🖥 Pantalla', ja: '🖥 Display', fr: '🖥 Affichage', de: '🖥 Anzeige', ru: '🖥 Экран' },
  'tc.dirTitle':  { zh: '🎯 Directory', en: '🎯 Directory', es: '🎯 Directorio', ja: '🎯 カタログ', fr: '🎯 Annuaire', de: '🎯 Verzeichnis', ru: '🎯 Каталог' },

  // ──  ─────────────────────────────────────────────────
  'tip.walkTouch': {
    zh: 'Drag to look · joystick to move · pinch-out to take off',
    en: 'Drag to look · joystick to move · pinch-out to take off',
    es: 'Arrastrar para mirar · joystick para mover · pellizcar hacia afuera para despegar',
    ja: '',
    fr: 'Glisser pour regarder · joystick pour bouger · pincer vers l\'extérieur pour décoller',
    de: 'Ziehen zum Schauen · Joystick zum Bewegen · pinch-out zum Abheben',
    ru: 'Перетаскивание для осмотра · джойстик для движения · щипок наружу для взлёта',
  },
  'tip.flyTouch': {
    zh: 'Drag to look · joystick to strafe · top-left to return',
    en: 'Drag to look · joystick to strafe · top-left to return',
    es: 'Arrastrar para girar · joystick para desplazarse · arriba a la izquierda para volver',
    ja: '',
    fr: 'Glisser pour tourner · joystick pour straffer · en haut à gauche pour revenir',
    de: 'Ziehen zum Drehen · Joystick zum Strafen · oben links zum Zurückkehren',
    ru: 'Перетаскивание для поворота · джойстик для смещения · вверху слева для возврата',
  },
};

/** Get localized string: priority to current language (defaulting to en), returns key on missing */
export function t(key, vars) {
  const e = D[key];
  let s;
  if (!e) {
    s = key;
  } else if (typeof e === 'string') {
    s = e;
  } else {
    s = (LANG !== 'zh' && e[LANG]) ? e[LANG] : (e.en ?? e.zh ?? key);
  }
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/** Body localized name: returns English name by default */
export function bodyName(entry) {
  if (!entry) return '';
  return entry.nameEn || entry.name || entry.nameZh || '';
}

const isTouchDevice = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 &&
  (typeof window === 'undefined' || window.matchMedia?.('(pointer: coarse)').matches);

/** Apply i18n to DOM elements */
export function applyDomI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.getAttribute('data-i18n-html'));
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.getAttribute('data-i18n-ph'));

  // Mobile: update start hint for touch
  if (isTouchDevice()) {
    const hint = root.querySelector('.start-inner .hint');
    if (hint) hint.textContent = t('start.hintTouch');
  }

  document.documentElement.lang = LANG || 'en';
  const inner = document.querySelector('#help .help-inner');
  if (inner) inner.innerHTML = isTouchDevice() ? HELP_TOUCH_EN : HELP_EN;
}

const HELP_EN = `
  <h2>Controls (press H to close)</h2>
  <div class="help-cols">
    <div>
      <h3>🌐 Explore mode (default · Google Earth style)</h3>
      <table>
        <tr><td>Left-drag</td><td>Orbit around focus (inertia; auto-slows near surface)</td></tr>
        <tr><td>Ctrl+Left-drag</td><td>Rotate heading / tilt (3D look-around)</td></tr>
        <tr><td>Right/Middle-drag</td><td>Pan the whole space (no rotation; R to reset)</td></tr>
        <tr><td>W S A D / Arrows</td><td>Pan view (N/S/W/E, speed scales with altitude)</td></tr>
        <tr><td>Shift+A / Shift+D</td><td>Rotate heading (CCW / CW)</td></tr>
        <tr><td>Shift+W / Shift+S</td><td>Tilt toward horizon / back to top-down</td></tr>
        <tr><td>Click a body</td><td><b>Lock focus</b> (scroll then approaches it; can land directly)</td></tr>
        <tr><td>Scroll / PageUp PageDown / + −</td><td>Zoom about screen center (altitude-scaled: metre steps near ground, hover at <b>any altitude</b>)</td></tr>
        <tr><td>Scroll all the way in</td><td><b>Seamless landing</b> (auto switch to walking); oceans land on the water surface</td></tr>
        <tr><td>V</td><td>Inertial view (camera ignores rotation · pair with time-warp to watch moons orbit)</td></tr>
        <tr><td>Z</td><td><b>Clean / cinematic mode</b>: hide the entire UI (HUD / directory / labels / crosshair / compass), leaving only the universe (press Z again to restore; <code>?clean=1</code> starts in it)</td></tr>
        <tr><td>R</td><td>Reset view (north up, top-down)</td></tr>
        <tr><td>🪐 Directory</td><td>Pick a body → fly-to animation (left, open by default)</td></tr>
        <tr><td>Double-click label / T / 1–9,0</td><td>GE-style fly-to (target centered)</td></tr>
        <tr><td>Drag (while flying)</td><td>Interrupt the fly-to animation</td></tr>
        <tr><td>G</td><td>Land and walk when near the surface</td></tr>
        <tr><td>F</td><td>Toggle free flight</td></tr>
      </table>
      <h3>🚶 Surface walk</h3>
      <table>
        <tr><td>Mouse / W S A D</td><td>Look (360°) / walk (real surface gravity)</td></tr>
        <tr><td>Scroll back / PageUp</td><td><b>Seamless takeoff</b> back to explore (view preserved)</td></tr>
        <tr><td>Scroll in at water / PageDown</td><td><b>Dive</b> — low-sensitivity rise/sink, stop to hover; surfacing restores automatically</td></tr>
        <tr><td>Shift / Space</td><td>Run / jump (6× higher on the Moon); underwater Space = ascend</td></tr>
        <tr><td>G</td><td>Return to explore mode</td></tr>
      </table>
    </div>
    <div>
      <h3>🚀 Free flight (press F)</h3>
      <table>
        <tr><td>Mouse / Q E</td><td>Pitch & yaw / roll</td></tr>
        <tr><td>W S A D R F</td><td>Six-axis translation</td></tr>
        <tr><td>Scroll / Shift</td><td>Speed gear (1 m/s→2 AU/s) / boost</td></tr>
        <tr><td>X</td><td>Full stop (hover anywhere)</td></tr>
        <tr><td>V</td><td>First-person cockpit / third-person external view</td></tr>
        <tr><td>Esc</td><td>Return to explore mode</td></tr>
      </table>
      <h3>⏱ Time</h3>
      <table>
        <tr><td>[ / ]</td><td>Time warp slower / faster (can reverse)</td></tr>
        <tr><td>P / N</td><td>Pause / back to now</td></tr>
      </table>
      <h3>🖥 Display</h3>
      <table>
        <tr><td>O / L / H</td><td>Orbit lines / labels / this help</td></tr>
        <tr><td>K</td><td>Trans-Neptunian (TNO) orbit lines (off by default)</td></tr>
        <tr><td>C</td><td>Compass</td></tr>
        <tr><td>M</td><td>Sound (off by default)</td></tr>
        <tr><td>Y</td><td>Human silhouette reference (walk mode · sense of scale)</td></tr>
        <tr><td>U</td><td>Earth–Moon true-scale comparison (diameter and distance to scale)</td></tr>
        <tr><td>Ctrl+B / Ctrl+Shift+B</td><td>Save bookmark / jump to the most recent bookmark</td></tr>
        <tr><td>J</td><td>Real gravity (in flight · off by default; enables free-fall and orbit insertion)</td></tr>
      </table>
    </div>
  </div>
  <p class="credit">Ephemerides: NASA JPL (Standish planetary elements + Horizons-fitted moon orbits, verified against official data)<br>
  Textures: NASA/USGS data (Solar System Scope CC-BY-4.0 / Steve Albers SOS / JPL Photojournal)</p>
`;

const HELP_TOUCH_EN = `
  <h2>Touch Controls (tap ❓ to close)</h2>
  <h3>🌐 Explore mode (default)</h3>
  <table>
    <tr><td>One-finger drag</td><td>Orbit around focus (with inertia)</td></tr>
    <tr><td>Pinch / spread</td><td>Zoom in / zoom out (spread all the way in → <b>seamless landing</b>)</td></tr>
    <tr><td>Two-finger drag</td><td>Pan the space (no rotation)</td></tr>
    <tr><td>Tap a body / label</td><td>Select / lock focus</td></tr>
    <tr><td>Double-tap label</td><td>Fly to that body (GE animation)</td></tr>
    <tr><td>＋ / － buttons</td><td>Hold to zoom in / out</td></tr>
    <tr><td>🪐 button</td><td>Toggle body directory drawer</td></tr>
    <tr><td>🎯 button</td><td>Toggle selected-body info panel</td></tr>
    <tr><td>✈ button</td><td>Fly to selected body</td></tr>
    <tr><td>🛬 button</td><td>Land (appears when near surface)</td></tr>
    <tr><td>🚀 Fly button</td><td>Enter free-flight mode</td></tr>
    <tr><td>↺ Reset button</td><td>Reset view (north up, top-down)</td></tr>
  </table>
  <h3>🚶 Surface walk</h3>
  <table>
    <tr><td>One-finger drag</td><td>Look around (360°)</td></tr>
    <tr><td>Left joystick</td><td>Walk (real surface gravity)</td></tr>
    <tr><td>↑ Jump button</td><td>Jump (6× higher on the Moon)</td></tr>
    <tr><td>⚡ Run button</td><td>Hold to sprint</td></tr>
    <tr><td>🚀 Takeoff button</td><td>Seamless takeoff back to explore</td></tr>
    <tr><td>🌐 Explore button</td><td>Return to explore mode</td></tr>
  </table>
  <h3>🚀 Free flight</h3>
  <table>
    <tr><td>One-finger drag</td><td>Pitch &amp; yaw</td></tr>
    <tr><td>Left joystick</td><td>Strafe / forward / backward</td></tr>
    <tr><td>▲ / ▼ buttons</td><td>Hold to ascend / descend</td></tr>
    <tr><td>⏹ Stop button</td><td>Full stop (hover anywhere)</td></tr>
    <tr><td>🌐 Explore button</td><td>Return to explore mode</td></tr>
  </table>
  <h3>☰ Menu</h3>
  <table>
    <tr><td>⏮ / ⏭ buttons</td><td>Time warp slower / faster</td></tr>
    <tr><td>⏸ / ⏺ buttons</td><td>Pause / reset to now</td></tr>
    <tr><td>🛤 / 🏷 buttons</td><td>Toggle orbit lines / labels</td></tr>
    <tr><td>🛰 Inertial</td><td>Camera ignores rotation (watch moons orbit)</td></tr>
  </table>
  <p class="credit">Ephemerides: NASA JPL · Textures: NASA/USGS</p>
`;

const HELP_TOUCH_ZH = HELP_TOUCH_EN;
