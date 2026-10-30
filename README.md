# Mai

**[mai-tutor.com](https://mai-tutor.com)** · a language-learning journal and cheatsheet, built around the
words *you* actually use.

Mai teaches a new language by starting from how you already talk. Instead of textbook vocabulary, it
finds the words you say most and helps you say *those* in the language you're learning, in your dialect.
You write a journal in that language (mixing in English when you're stuck), and Mai corrects it like a
teacher's red pen.

Everything is rule-based and data-driven, from the [which-dialect](https://www.npmjs.com/package/which-dialect)
dictionaries: no AI or LLM calls.

## Languages

- **Vietnamese:** Southern, Central, Northern
- **Spanish:** Latin American, Mexican, Spain, Argentine, Colombian

## What it does

- **Journal** (the home page): write entries in the language you're learning, on graph paper, with
  photos, cut-out stickers, captions and an audio note. Mai writes corrections above your words:
  - missing accents added (*khong* → *không*);
  - English words swapped for your dialect's word (*market* → *chợ*);
  - English clauses filled into common sentence frames;
  - optional checks for regional words and pronoun consistency.

  Tap any word to see what it means, other words that fit, and star the one you want.
- **Cheatsheets:** the 100 most common English words, or your own list (typed, pasted or uploaded),
  each with its meanings and translations into your dialect. For pronouns, there's a "who are you
  talking to?" table.
- **Personal Word List Discoverer:** chat casually with Mai, and it shows the words you used most, to
  turn into a cheatsheet.
- **Settings:** the language and dialect you're learning, the journal's extra checks, and your account.
- **Accounts and sync:** sign in to keep your journal, words and settings on every device. Signed out,
  everything stays on your device.
- **Feedback:** signed-in users can send feedback, or flag a wrong word or definition from any word box.

It works on a phone too: open mai-tutor.com in Safari and use **Add to Home Screen**.

## How it's built

- **`web/`:** the app. React 19, Vite and TypeScript, deployed on Vercel.
- **`supabase/`:** the backend. Postgres (accounts, synced data, a translation cache), Storage (photos,
  stickers, audio and the dictionary data) and edge functions:
  - `translate`: Cheatsheet entries for your own words;
  - `check-spelling`: the journal review;
  - `word-options`: a word's meanings and alternatives;
  - `sentence-frames`: the frames browser;
  - `feedback`: feedback, filed as tickets on a Notion board.
- **[which-dialect](https://www.npmjs.com/package/which-dialect):** the dictionaries, dialect data,
  spellchecker and journal review behind all of it.

[`ARCHITECTURE.md`](ARCHITECTURE.md) is the deep dive into the code and the reasons behind it.
[`NOTES.md`](NOTES.md) has the product ideas and decisions.

## Running it locally

You need Node, plus Docker for the local backend. Start everything with:

```sh
scripts/local.sh
```

It starts the local Supabase and loads the dictionary data, then opens the app. Ctrl-C stops the app;
`scripts/local.sh --stop` stops Supabase.

To work on the front end alone (the backend features won't work):

```sh
cd web
npm install
npm run dev
```

Before committing, run the checks from `web/`: `npm run build` and `npm run lint`.

## Contributing

Work branches off `develop`, and pull requests target `develop`. A release merges `develop` into
`master`, which deploys mai-tutor.com. A [gitleaks](https://github.com/gitleaks/gitleaks) pre-commit hook
blocks secrets. Turn it on with:

```sh
git config core.hooksPath .githooks
```
