# КАТАЛОГ ПЕРВОИСТОЧНИКОВ ОБУЧЕНИЯ (заведён 26.08.2026)

Зачем: при сборке уроков и досок обращаться СЮДА за «где взять канон», а в
EDU_BASE.md — за уже сверенными фактами. Порядок работы: нужен факт → ищем в
EDU_BASE → нет? → идём по источнику отсюда, сверяем, ВНОСИМ в EDU_BASE (§8),
только потом в урок. Пометки: [С] — сверено живой выдачей/документом в эту
дату; [З] — устойчивое знание, при первом использовании перепроверить.

## 1. Официальная школа Blackmagic Design [С 25.08]

blackmagicdesign.com/products/davinciresolve/training — бесплатные PDF-книги
с упражнениями и экзаменами (канон терминов и интерфейса Resolve):
- The Beginner's Guide to DaVinci Resolve — вход, все страницы программы
- The Editor's Guide — монтаж углублённо
- **The Colorist Guide** — грейд: ноды, скоупы, квалифайер, окна, трекинг, ACES
- The Fairlight Audio Guide — звук
- The Visual Effects Guide + Advanced VFX — Fusion, 3D-трекинг, частицы
Там же — официальные сертификационные экзамены (бесплатно).

## 2. Школы колористов и курсы [С 26.08]

- **Mixing Light** (mixinglight.com) — главная библиотека разборов от
  работающих колористов (Insights); канон по Contrast/Pivot, нодовым
  стратегиям, работе с клиентом. Часть статей открыта, глубина — по подписке.
- **Lowepost** (lowepost.com) — курсы, снятые в грейд-сьютах Лос-Анджелеса:
  Technicolor, EFILM, Light Iron, Warner Bros; преподают действующие
  колористы (Douglas Delaney/Technicolor, Chris Jacobson/«Suits» и др.).
  Там же архив статей по теории цвета (Color Decision List Explained и т.п.).
- **International Colorist Academy / ICA** (icolorist.com) — школа Кевина Шоу
  (Kevin Shaw) и Уоррена Иглза (Warren Eagles), 50+ лет грейда на двоих;
  очные и онлайн-классы (LA, NY, Лондон, Сидней).
- **Colorist Society** (coloristsociety.com/colorist-training) — список
  признанных программ обучения от профессионального общества колористов.
- **UCLA Extension** — курс Color Correction for Film and Television
  (техника + эстетика, роль колориста в повествовании).
- Jonny Elwyn — обзор-хаб «Learn Colour Grading from Professional Colorists»
  (jonnyelwyn.co.uk) — регулярно обновляемая карта живых ресурсов профессии.

## 3. Голливудские колористы и их открытые материалы [З — сверять при цитировании]

- **Steve Yedlin, ASC** (yedlin.net) — эссе и демо (Display Preparation Demo,
  On Color Science): почему «look» — это математика конвейера, а не LUT.
- **Cullen Kelly** (YouTube) — колорист LA; системный подход к пайплайну,
  ведёт разборы и у Mixing Light.
- **Darren Mostyn** (YouTube) — колорист/онлайн-курсы, самые подробные
  разборы инструментов Resolve по шагам.
- **Juan Melara** (juanmelara.com.au) — колорист; разборы print-film
  эмуляции, PowerGrades, математика трансформов.
- **Waqas Qazi** (YouTube «Qazi») — коммерческий грейд, работа с клиентами.
- **Walter Volpatto, Dado Valentic, Stefan Sonnenfeld** — имена-ориентиры
  индустрии (Company 3 и др.): интервью и подкасты искать по имени.
- Форум **liftgammagain.com** — главное живое сообщество колористов,
  там отвечают действующие профи (включая разработчиков Resolve).
- Форум **Team Deakins** (rogerdeakins.com) — экспозиция, свет, кожа.

## 4. Технические стандарты и white papers (точная математика) [С 26.08]

- **ASC CDL** — индустриальный стандарт обмена первичной коррекцией
  (slope/offset/power/sat); формула — EDU_BASE §8д.2. Разборы: Pomfort
  «An in-depth look at ASC-CDL based color controls», Lowepost «CDL Explained».
- **Sony S-Log3** — «Technical Summary for S-Gamut3.Cine/S-Log3 and
  S-Gamut3/S-Log3» (pro.sony, PDF): точная формула кривой — EDU_BASE §8д.4.
- **ARRI LogC3 / LogC4** — официальные спецификации ARRI (arri.com, PDF:
  «ARRI LogC4 Logarithmic Color Space Specification»; LogC3 — white paper
  с константами по EI): формулы — EDU_BASE §8д.5.
- **ITU-R BT.709** (OETF камеры), **BT.1886** (EOTF дисплея), **BT.2100**
  (HDR: PQ/HLG) — сами стандарты бесплатны на itu.int.
- **colour-science.org** (питон-библиотека colour) — референс-реализации
  ВСЕХ кривых и матриц с источниками; сверять константы формул по ней.
- **ACES** — docs.acescentral.com (спеки CLF, IDT/ODT, терминология).
- **Netflix Partner Help Center** — требования к сдаче мастеров (цвет,
  диапазоны, QC) — нормативы стриминга.
- **Charles Poynton — Color FAQ / Gamma FAQ** (poynton.ca) — классика
  видеосигнальной математики.

## 5. Разборы и статьи (рабочие, из §8а EDU_BASE) [С 25.08]

- mononodes.com — color management в Resolve
- cinapex.pro — чтение скоупов, IRE и стопы, шот-матчинг
- frame.io Workflow Guide — RAW-конвейер от съёмки до сдачи
- xdcam-user.com (Alister Chapman) — мифы про RAW и log
- Mixing Light «The Multiple Personalities of Resolve's Contrast-Pivot
  Controls» + «Creating An S-Curve Using The Contrast & Pivot Controls» —
  канон поведения Contrast/Pivot (использовано в §8д.3)

## 6. Постановка и съёмка [С 25.08]

- Hollywood Camera Work (hollywoodcamerawork.com) — Master Course in
  High-End Blocking & Staging, Hot Moves, Directing Actors, VFX for
  Directors; приложения Shot Designer, Green Screener; Free Downloads.
- Шот-листы и вызывные листы: StudioBinder (studiobinder.com/blog/
  shot-list-template-free-download/) и Boords (boords.com/shot-list-template) —
  мировые эталоны, из них взят набор колонок (scene/shot, size, angle,
  movement, lens, notes) [С 26.08].
- Канон монтажной (свой, C:/src/cutroom/docs/COMPOSITION.md) — крупности как
  язык §4, причина движения камеры §6; из него собрана номенклатура
  EDU_BASE §8ж.

## 7. Куда это применяется на сайте

- Доски-обучалки (uroki/) — карта в EDU_BASE §8в, формулы в §8д.
- Правило честности: доска исполняет ОПУБЛИКОВАННУЮ формулу — подписываем
  стандарт и источник; где имитация/упрощение — подписываем прямо на доске.
- Числа в статьях/уроках — только через EDU_BASE (закон §0 этого файла).
