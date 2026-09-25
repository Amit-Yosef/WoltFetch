# WoltFetch

קטלוג עברי RTL לפריטי וולט. כל כרטיס מציג שם, תמונה ומק״ט. לחיצה על פריט מאפשרת להעלות או לראות תמונת אריזה אמיתית. **תמונות האריזה נשמרות בשרת בלבד ולא נשלחות לוולט.**

## הרצה מקומית

```bash
cp .env.example .env
# מלאו WOLT_USERNAME, WOLT_PASSWORD, WOLT_VENUE_ID
npm install
npm run dev
```

הממשק: http://localhost:5173  
ה־API: http://localhost:3001

בלי `DATABASE_URL` התמונות נשמרות ב־SQLite (`data/woltfetch.db`) וגם כקבצים ב־`data/photos/`.

## איפה נשמרות תמונות האריזה

העלאה הולכת ל־`PUT /api/items/:id/photo`. השרת שומר את קובץ התמונה בטבלת `packaging_photos`:

- מקומית: SQLite blob + עותק דיסק
- ב־Railway: Postgres `BYTEA` (דיסק הקונטיינר לא נשמר בין דיפלויים)

וולט לא מקבל את הקובץ.

## פרסום ל־Railway + GitHub Actions

1. צרו פרויקט ב־[Railway](https://railway.com) והוסיפו שירות מהריפו הזה.

2. הוסיפו תוסף **PostgreSQL**. Railway ימלא אוטומטית את `DATABASE_URL`.

3. הגדירו משתני סביבה לשירות:

```
WOLT_USERNAME=...
WOLT_PASSWORD=...
WOLT_VENUE_ID=66617325a2968e48c156b941
WOLT_BASE_URL=https://pos-integration-service.wolt.com
NODE_ENV=production
```

4. צרו **Project Token** ב־Railway: Project Settings → Tokens.

5. ב־GitHub: Settings → Secrets and variables → Actions, הוסיפו:

- `RAILWAY_TOKEN` (חובה, Project Token)
- `RAILWAY_SERVICE`: `WoltFetch` (the GitHub-connected canvas block, not Postgres and not a UUID)

6. דחיפה ל־`main` מריצה build ואז `railway up` ל־Railway.

אפשר גם לחבר את הריפו ישירות ב־Railway ולוותר על ה־Action. אל תפעילו גם GitHub auto-deploy ב־Railway וגם את ה־Action, אחרת כל push ייפרס פעמיים.

## API

- `GET /api/health`
- `GET /api/menu` משיכת תפריט (עם מטמון 30 דקות)
- `GET /api/menu?refresh=1` סנכרון מול וולט
- `GET /api/items/:id/photo` תמונת אריזה מהמסד
- `PUT /api/items/:id/photo` העלאה (שדה `photo`)
- `DELETE /api/items/:id/photo`
