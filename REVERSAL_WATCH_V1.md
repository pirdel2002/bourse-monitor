# Rule Pack: reversal_watch_v1

این بسته ۱۸ نماد Watchlist و تمام موقعیت‌های ثبت‌شده در `portfolio_positions` را مدیریت می‌کند. Ruleهای قدیمی حذف یا بازنویسی نمی‌شوند. فقط Ruleهایی که در `action_params_json` دارای `strategy = reversal_watch_v1` و `managed = true` هستند Upsert می‌شوند.

## چرخه خرید

```text
SECONDARY_WATCH
→ RULE_WATCH
→ TRIGGERED_WAIT_CONFIRMATION
→ BUY_CANDIDATE
→ BUY_NOW
```

نماد Secondary در همان Snapshot که Trigger اولیه را فعال می‌کند، فقط به `RULE_WATCH` می‌رود. بررسی خرید از Snapshot بعدی انجام می‌شود.

Confirmation نهایی شامل Trigger نماد، `CLOSE_ABOVE_EMA20`، No-Chase، حداقل ۲ تأیید Momentum و حداقل ۱ تأیید Flow است. شواهد Trigger و Confirmation با منبع جدا گزارش می‌شوند. یک Condition تکراری فقط یک بار در شمارش هر خانواده محاسبه می‌شود.

Momentum:

- `EMA20_NON_DECREASING`
- `MACD_BULLISH_CROSS`
- `MACD_RECOVERY_EARLY` یا `MACD_NEGATIVE_SHRINKING` به‌عنوان یک خانواده
- `OBV_TURN_UP`

Flow/Participation:

- `VOLUME_RATIO_ABOVE(1.2)`
- `BUYER_POWER_ABOVE(1.2)`
- `REAL_MONEY_FLOW_POSITIVE`

No-Chase:

- `RETURN_BELOW(5,10)`
- `RETURN_BELOW(20,25)`
- سقف اختصاصی حتاید: ۸٬۶۰۰ ریال

`BUY_NOW` فقط وقتی مجاز است که تعداد، سقف قیمت، سرمایه تخصیصی، Stop و Target1 کامل باشند. در غیر این صورت بیشترین خروجی `BUY_CANDIDATE` است.

## Exit Engine

برای هر موقعیت ثبت‌شده Ruleهای Hard Stop، Position Stop، کاهش موقعیت و سیو سود به‌صورت managed ساخته می‌شوند. اولویت تصمیم‌ها:

```text
HARD_STOP / POSITION_STOP_HIT
> STRUCTURAL SELL_ALL
> TAKE_PROFIT
> REDUCE_POSITION
> BUY_NOW
> BUY_CANDIDATE
> TRIGGERED_WAIT_CONFIRMATION
> RULE_WATCH
> SECONDARY_WATCH
```

ضعف تکنیکی یعنی حداقل ۲ مورد از MACD نزولی، OBV نزولی، Close زیر EMA20، BuyerPower زیر ۰٫۸ و خروج پول حقیقی. خروج ساختاری به شکست حمایت اصلی و حداقل یک تأیید ضعف نیاز دارد. شکست حمایت با حجم بالا و خروج پول حقیقی شدید تلقی می‌شود.

Stop هیچ‌وقت کاهش نمی‌یابد:

- سود کمتر از ۱۰٪: Initial Stop
- سود ۱۰٪ تا ۲۰٪: حداقل Breakeven
- سود ۲۰٪ تا ۳۰٪: Trailing 7%
- سود ۳۰٪ و بیشتر: Trailing 5%

## مصرف API و Dry Run

محاسبات از AllSymbols مشترک و تاریخچه محلی انجام می‌شوند. هیچ درخواست API به ازای Rule ایجاد نمی‌شود. مسیر `POST /api/strategy/reversal-watch/dry-run` فقط از `symbol_catalog`، `daily_candles`، `symbol_ticks` و `portfolio_positions` می‌خواند. این مسیر Telegram و API بازار را صدا نمی‌زند.

اگر تاریخچه، Snapshot یا اطلاعات موقعیت کافی نباشد، نتیجه با وضعیت داده ناکافی گزارش می‌شود و مقدار ساختگی تولید نمی‌شود.
