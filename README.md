# Aroma CRM

Prywatny CRM dla aromaterapeutki: kontakty (klienci, partnerzy, znajomi z Facebooka), historia rozmów, kalendarz spotkań, grupy z Facebooka i codzienne News po polsku (PubMed i Instytut Aromaterapii). Działa w przeglądarce, także na telefonie jako aplikacja.

## Wgranie na GitHub (jednorazowo, ok. 15 minut)

Rozpakuj plik ZIP na komputerze. Wszystko poniżej robisz w przeglądarce, na stronie github.com.

**1. Utwórz repozytorium**
- Kliknij **+** w prawym górnym rogu, potem **New repository**.
- Nazwa: `aroma-crm`.
- Ustaw **Public**. Darmowe GitHub Pages wymaga publicznego repozytorium. W repozytorium nie ma żadnych danych klientów, ich kontakty zostają tylko w Twojej przeglądarce.
- Nie zaznaczaj dodawania README, .gitignore ani licencji. Kliknij **Create repository**.

**2. Włącz stronę (zanim wgrasz pliki)**
- W repozytorium wejdź w **Settings**, potem **Pages**.
- W sekcji *Build and deployment* przy **Source** wybierz **GitHub Actions**.

**3. Wgraj pliki**
- Wróć na stronę główną repozytorium i kliknij **uploading an existing file**.
- Przeciągnij całą zawartość rozpakowanego folderu: `index.html`, `manifest.webmanifest`, `sw.js`, `news.json`, `README.md`, `.gitignore` oraz foldery `icons`, `scripts` i `.github`.
- Folder `.github` jest ukryty. Na Windows włącz w Eksploratorze *Widok, Pokaż, Elementy ukryte*. Jeśli przeglądarka nie przyjmie tego folderu, utwórz plik ręcznie: **Add file**, **Create new file**, w polu nazwy wpisz `.github/workflows/site.yml` i wklej zawartość pliku `site.yml`.
- Kliknij **Commit changes**.

**4. Sprawdź, czy się uruchomiło**
- Wejdź w zakładkę **Actions**. Workflow **Strona i codzienne News** powinien ruszyć sam. Poczekaj 1 do 2 minut na zielony znaczek.
- Jeśli jest czerwony, kliknij go, wejdź w ostatni przebieg i prześlij mi zrzut ekranu. Jeśli skończył się błędem przed włączeniem Pages w kroku 2, włącz Pages i kliknij **Re-run all jobs**.
- Adres Twojej aplikacji: `https://TWOJ-LOGIN.github.io/aroma-crm/` (widoczny też w *Settings, Pages*).

## Streszczenia po polsku (klucz API)

Bez klucza codzienne News działają, ale pokazują tytuły i linki. Z kluczem Claude pisze streszczenia po polsku.

1. Wejdź na `console.anthropic.com`, zaloguj się, w *API keys* kliknij **Create key** i skopiuj klucz. Doładuj niewielkie saldo w sekcji rozliczeń. Ten dostęp jest osobny od abonamentu Claude.
2. W repozytorium: **Settings, Secrets and variables, Actions, New repository secret**. Nazwa: `ANTHROPIC_API_KEY`, wartość: wklejony klucz.
3. W zakładce **Actions** wybierz **Strona i codzienne News**, kliknij **Run workflow**.

Klucz wpisuj tylko tutaj. Nie wklejaj go do czatu ani do żadnych plików.

## Jak działa codzienna aktualizacja

Co rano (około 7:00 w lecie, 6:00 w zimie) GitHub sam pobiera nowe badania z PubMed i wpisy z Instytutu Aromaterapii, przygotowuje streszczenia i odświeża stronę. Możesz też uruchomić to ręcznie: **Actions, Run workflow**. Jeśli kiedyś harmonogram się wyłączy (GitHub robi to w nieaktywnych repozytoriach), włącz go w zakładce Actions.

## Telefon

- **Android (Chrome):** otwórz adres aplikacji, menu z trzema kropkami, **Zainstaluj aplikację**.
- **iPhone (Safari):** otwórz adres, przycisk Udostępnij, **Do ekranu początkowego**.
- Dane na każdym urządzeniu są osobne. Żeby przenieść kontakty z komputera: w CRM wejdź w **Kopia i eksport**, **Pobierz kopię (JSON)**, wyślij plik sobie (e-mail, dysk), a na telefonie użyj **Wczytaj kopię**. Dotyczy też przeniesienia danych z wersji lokalnej na stronę z GitHuba, bo to osobne miejsce zapisu. Automatyczna synchronizacja telefon i komputer to kolejny etap.

## Prywatność

- Dane klientów są zapisane tylko w przeglądarce. Nie ma ich w repozytorium.
- Nigdy nie wgrywaj do repozytorium pobranych kopii zapasowych (`aroma-crm-kopia-*.json`) ani plików CSV z kontaktami.
- Każdy, kto otworzy adres strony, zobaczy pusty CRM i publiczne News, ale nie Twoje dane.

## Aktualizacje wyglądu i funkcji

Nową wersję `index.html` wgrywasz tak samo: w repozytorium **Add file, Upload files**, nadpisz plik i zatwierdź. Strona odświeży się sama.

## Pliki

- `index.html`: cała aplikacja
- `manifest.webmanifest`, `sw.js`, `icons/`: instalacja na telefonie i praca bez internetu
- `news.json`: codzienne News (wypełnia je automat)
- `scripts/fetch-news.mjs`: pobieranie i streszczanie
- `.github/workflows/site.yml`: harmonogram i publikacja strony
