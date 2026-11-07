> Historical design record (2026-11-03); current behavior is defined by the code on main and docs/integrations/*. All implementation instructions, status assertions, proof receipts and file/symbol references below describe the historical proposal/checkpoint only. They are not current contracts, execution instructions or evidence of deployed state.

# Opus 5.5/high round 1 — original findings

Reviewer link: <t3-thread://v2/438824e0-fe19-4a22-bb31-f81eff7b7322/thread:delegated-task:command%3Amcp%3A2ab4ac78-5db5-40ac-8c50-c442ecc10107%3Adelegate-task%3Acuremed-whatsapp-plan-opus-round1-20261103>

The following is the reviewer's original result. The manager's English verdicts and amendments are recorded in the implementation plan. Dispatch returned claude-opus-5-5 with effort=high. File hashes and Git status were unchanged after review. The reviewer disclosed one out-of-allowlist donor search with no matches; future briefs prohibit broad directory searches.

# مراجعة الجولة 1: خطة WhatsApp Evolution والإشعارات التلقائية بعد الدفع

**الخلاصة:** الخطة مش جاهزة للتنفيذ. فيه 3 مشاكل حاجبة (P1): واحدة ممكن تخلّي عميل دفع فلوسه وطلبه ما يتحولش لـ paid أبدًا، والتانية ممكن توقف رسايل Postora والشحن الشغالة دلوقتي في production أول ما يحصل merge، والتالتة تخلّي إثبات الطلب المدفوع في production مستحيل لو الإيقاف الوزاري لسه شغال.

---

## P1: حاجبة

### R1-F1 · P1 · فشل جدولة الرسايل بيرجّع حالة الدفع لورا
- **القسم:** Plan "Trusted paid event and email boundary" سطر 124 و128، وTask 3 (175–181) وTask 5 (199–205).
- **السيناريو:**
  1. `wa_apply_verified_payment` بتعمل في transaction واحدة: paid outcome + evidence + event + توليد الـ templates والأرقام والـ jobs.
  2. لو ده فشل بيرجع "visible processing failure".
  3. لو فيه admin number أو template محفوظ فيه مشكلة، أو constraint اتخالف، أو bug في الـ normalizer، الـ transaction كلها بترجع، ومعاها حالة الـ paid.
  4. الـ webhook بيرجّع 500، وMyFatoorah بيعيد بنفس المدخلات، فبيفشل تاني بنفس الطريقة.
  5. النتيجة: عميل اتخصم منه فلوس وطلبه مش هيبقى paid أبدًا.
- **الدليل:** `supabase/functions/myfatoorah-webhook/index.ts:101-108` بيرجع 500 عند أي استثناء. والـ spec نفسه بيقول في §6: "Failures do not break the payment callback … after the durable event is recorded"، وفي §5: "a paid status alone must not cause the enqueue recovery path to return early".
- **أصغر تصحيح (جوّه spec §5/§6، مش تغيير للـ spec):**
  - الـ paid transition والـ evidence وصف الـ event يتعملهم commit من غير شرط.
  - توليد الـ recipients والـ jobs يبقى جوّه nested `BEGIN … EXCEPTION` block. لو فشل، الـ event يتعلّم `enqueue_failed` مع safe reason code، وما يتقالش عليه scheduled أبدًا.
  - الـ replay يصلّح الـ event اللي حالته `enqueue_failed` عن طريق صف الـ event نفسه، مش يوقف بدري عشان "already paid".
  - إضافة اختبار SQL: template أو recipient config فاسد → الطلب يبقى paid والـ event يبقى `enqueue_failed`.

### R1-F2 · P1 · رسايل Postora والشحن الحالية هتقف عند الـ merge
- **القسم:**
  - Task 6 سطر 211 و214: كل أشكال `send-whatsapp` بتعدي على claim/finish.
  - `wa_claim_delivery` سطر 116: بيتحقق من "enablement".
  - `whatsapp_settings` سطر 86: "New automation defaults off".
  - Task 4 سطر 188: نقل مفتاح Postora خطوة admin بعد الـ deploy.
  - الـ scheduler مش موجود قبل Task 12/14.
- **السيناريو:** بعد الـ merge اللي بيعمل auto-deploy:
  - `order.shipped` من `AdminOrders.tsx` ورسايل `order.paid` القديمة بيتعملها durable jobs.
  - الـ claim بيرفضها لأن الـ automation مقفولة، أو ما فيش scheduler يشغّلها.
  - أو الـ provider مش لاقي key في `private.wa_credentials` لسه.
  - النتيجة: رسايل production الشغالة بتقف من غير ما حد يحس. ده ضد القرار المعتمد "Keep existing Postora active until Evolution pairing and send tests succeed" وضد "Existing shipment WhatsApp support stays operational".
- **الدليل:** `_shared/apply-payment.ts:196-234`، `src/pages/admin/AdminOrders.tsx:386-394`، `send-whatsapp/index.ts:107-110` (المفتاح بيتقري من `site_settings` أو env).
- **أصغر تصحيح:**
  - تعريف job classes: `automation` / `legacy_event` (shipment, legacy order.paid/admin.new_order) / `manual` / `test`، مع جدول يوضح أي gate بيسري على أي class.
  - `legacy_event` و`manual` يتعملهم claim جوّه نفس الـ request لنفس الـ `job_id`، من غير اعتماد على الـ scheduler أو master automation switch.
  - تعريف فترة fallback صريحة لقراية المفتاح القديم لحد ما الترحيل ينجح.
  - Regression test: "automation off, no heartbeat, Postora active, key not yet migrated → `order.shipped` accepted".

### R1-F3 · P1 مشروطة · إثبات الطلب المدفوع في production مستحيل لو الإيقاف الوزاري شغال
- **القسم:** Task 14 سطر 295، وspec §10.20.
- **السيناريو:** `create-myfatoorah-payment` بيرجع 503 `ordering_disabled` طول ما الإيقاف شغال، والـ spec §5 بيقول الإيقاف يفضل زي ما هو. يبقى "controlled live transaction" مش هتحصل، والحالة النهائية "deployed and verified" مالهاش طريق.
- **الدليل:** `create-myfatoorah-payment/index.ts:47-65`.
- **التصحيح:** قرار من المستخدم دلوقتي (الخطة نفسها في سطر 304 بتسمح بده). الاختيارات:
  - (أ) إثبات الدفع على staging مع MyFatoorah sandbox، وإثبات إرسال controlled منفصل في production.
  - (ب) استثناء مؤقت ومعتمد من الإيقاف.
  - (ج) تعريف بديل لشرط القبول.
- **ملاحظة:** ما قدرتش أتأكد من حالة الإيقاف live.

---

## P2: لازم تتصلح قبل التنفيذ

### R1-F4 · P2 · ثلاث مفاتيح تشغيل وقرار المالك متقسم بين SQL وDeno
- **القسم:** سطر 126–128 (`activation timestamp`، "versioned cutover flag"، master automation).
- **السيناريو:** الـ SQL بيقرا الـ activation جوّه الـ transaction، والـ Deno بيقرا الـ cutover flag بعد الـ commit. لو حد قلب المفتاح بين الخطوتين يا إما محدش يبعت WhatsApp، يا إما الاتنين يبعتوا.
- **التصحيح:** `wa_apply_verified_payment` يرجّع `legacy_whatsapp_owner boolean` يتحدد تحت نفس الـ settings lock، والـ Deno ينفّذ اللي اترجع بس. وتوثيق جدول حالات للمفاتيح التلاتة.

### R1-F5 · P2 · نقل حالة الدفع لـ RPC جديدة ده توسيع في نطاق الدفع
- **القسم:** Task 5 (199–205)، وspec §5 سطر 98.
- **السيناريو:** كل order paid هيعدي من migration تبع WhatsApp، حتى لو WhatsApp مقفول أو صف الـ settings مش موجود. ولو الـ allow-list ما شملتش أعمدة بيكتبها الكود حاليًا (`myfatoorah_card_brand`، `myfatoorah_card_last4`، `payment_online_method`، `failed_at`، `payment_error_*`)، شاشة الأدمن هتخسر بيانات.
- **الدليل:** `apply-payment.ts:71-96`.
- **التصحيح:**
  - تسجيله كـ added scope زي ما spec §5 بيطلب.
  - اختبارات regression: paid مع WhatsApp disabled، singleton مش موجود، final/pending من غير downgrade، والحفاظ على كل الأعمدة اللي بتتكتب دلوقتي.

### R1-F6 · P2 · مفيش trigger محدد لإعادة الإصلاح (spec §10.5)
- **القسم:** Task 5 سطر 201: "preserve current guest-owner authorization".
- **السيناريو:**
  - MyFatoorah بيعيد بس لما يرجعله 5xx.
  - زرار "Verify payment now" عند الأدمن بيبعت JWT بتاع الأدمن، والـ endpoint بيرفضه بـ 403 لأن الأدمن مش صاحب الطلب.
  - النتيجة: الـ event اللي حالته `enqueue_failed` (من F1) مالوش طريق إصلاح.
- **الدليل:** `AdminOrders.tsx:343-345`، `verify-myfatoorah-payment/index.ts:89-120`.
- **التصحيح:** تحديد trigger بالاسم، مثلًا `whatsapp-admin` action `event.repair` لـ admin فقط، أو تصريح أدمن في verify، أو مسح دوري من الـ scheduler.

### R1-F7 · P2 · قائمة الـ RPCs ناقصة عن اللي spec §8 بيطلبه
- **القسم:** "Proposed RPC signatures" (96–112)، وspec §8 سطر 167: "exact function names… before MiniMax starts".
- **السيناريو:** PostgREST مش واصل لـ schema `private`، فـ MiniMax هيعمل كتابة مباشرة على الجداول، أو Codex هيضيف RPCs من غير مراجعة.
- **الناقص:**
  - قراية الـ credential والـ ciphertext من Deno
  - البحث عن webhook secret (الحالي والسابق)
  - `connection.begin` و`connection.disconnect` بالـ generation commit
  - enqueue لرسايل manual، shipment/legacy، وtest
  - كتابة الـ heartbeat
  - بداية sync run
  - تسجيل media object
  - `contact.delete` و`message.forward`
  - ترحيل مفتاح Postora القديم
- **التصحيح:** تكملة القائمة بالـ signature والـ lock order لكل واحدة قبل Task 4.

### R1-F8 · P2 · ترتيب تطبيق الـ migration بيتعارض مع الـ runner التلقائي
- **القسم:** Task 14 سطر 292.
- **السيناريو:**
  1. تطبيق الـ schema يدويًا بـ psql قبل الـ merge.
  2. عند الـ merge، الـ cron runner ما يلاقيش الملف في `public.self_hosted_migrations`، فيطبّقه تاني.
  3. الـ DDL مش idempotent، فيفشل، و`die` بيحصل بعد ما الـ functions اتنسخت فعلًا وقبل الـ restart والـ smoke tests.
  4. النتيجة: deploy نص كامل.
  - كمان أي تعديل على الـ migration بعد تطبيقها بيترفض بسبب الـ checksum guard.
- **الدليل:** `SELF_HOSTED.md:114-116,141-143`، `scripts/supabase-post-deploy.sh:475-504,621-623`.
- **التصحيح:**
  - التطبيق بنفس semantics الـ runner: تسجيل filename وsha256 للـ bytes المعتمدة بالظبط.
  - تجميد الـ bytes بعد مراجعة Astra؛ أي تصليح يبقى ملف جديد.
  - ذكر ده في الـ rollout packet.

### R1-F9 · P2 · gate الـ checkout ما بيثبتش إن الأساس main
- **القسم:** Task 0 سطر 138–141.
- **السيناريو:** الـ primary checkout على commits Shipa (`bb494a4` و`3e9d307` فوق `878dde5`). لو الـ T3 isolation بدأت من الـ HEAD الحالي، commits Shipa هتدخل الفرع، والـ gate مش هيمسكها. وكمان جملة "restores the primary Shipa checkout" مش متوضحة: إيه اللي بيتغير في الـ primary أصلًا؟
- **التصحيح:**
  - gate صريح: `git rev-parse HEAD` == الـ `origin/main` بعد الـ refresh، و`git log origin/main..HEAD` فاضي، قبل أي delegate.
  - توضيح هل الـ primary بيتلمس أصلًا، وإيه الحماية للملفات untracked (مثلًا `supabase/functions/main/`).

### R1-F10 · P2 · شرط country code هيعمل skip لأرقام العملاء المحلية
- **القسم:** Task 1 سطر 147.
- **السيناريو:** الكود الحالي بيشيل غير الأرقام وبس. لو أرقام العملاء متخزنة بصيغة كويتية محلية (8 أرقام)، كل رسايل العملاء هتبقى skipped بصمت.
- **الدليل:** `send-whatsapp/index.ts:83-86`.
- **التصحيح:**
  - قاعدة default-country صريحة (مثلًا 965 للـ 8 أرقام) أو policy يعتمدها المستخدم.
  - إحصاء read-only لصيغ الأرقام المتخزنة قبل Task 1.
  - اختبار بالصيغ الحقيقية.

### R1-F11 · P2 · ملفات donor ناقصة من allowed paths
- **القسم:** Task 10 سطر 247، و File map سطر 44.
- **السيناريو:** Global constraint 1 بيقول "allowed paths only"، فـ MiniMax مش هيقدر ينفذ صف "Conversation identity" في spec §3.
- **الناقص:**
  - Task 10: `WhatsAppChatLink.tsx`، `contactSortValue.ts`، `ChatAvatar`، ومكافئ `src/lib/whatsappAvatar.ts`.
  - الـ file map: مفيهوش `_shared/whatsapp/chats.ts` و`avatars.ts`، مع إن Task 8/9 بيستخدموهم.
- **التصحيح:** إضافة المسارات دي صراحة.

### R1-F12 · P2 · عقد الـ webhook: أنواع الأحداث والحجم والـ retry
- **القسم:** Task 7 سطر 223–224.
- **السيناريو:**
  - أحداث bulk زي `MESSAGES_SET` و`CHATS_SET` و`CONTACTS_SET`/batches وقت الـ pairing ممكن تعدي حد الـ 1 MiB، فتترفض وتتكرر أو تضيع.
  - جملة "retriable HTTP result" ملهاش معنى غير لو `v2.3.7` بيعيد فعلًا.
- **التصحيح:**
  - قائمة أحداث صريحة تستبعد الـ bulk sets.
  - تثبيت `base64:false` (الـ media بتيجي عن طريق `getBase64FromMediaMessage` زي الـ donor).
  - Task 0 يسجل سلوك الـ retry في الـ gateway. لو مفيش retry، الاسترجاع يبقى عن طريق history sync فقط.
  - الحجم الزيادة على حدث authenticated يتعمله counter مرئي.

### R1-F13 · P2 · ربط session generation بالـ secret مش متعرّف
- **القسم:** Task 7 سطر 222–223.
- **السيناريو:** الـ payload اللي جاي من الـ gateway مفيهوش CureMed generation، فالتحقق المطلوب مستحيل.
- **التصحيح:** secret لكل generation، والـ generation يتعرف من أنهي secret طابق (الحالي أو السابق جوّه نافذة 5 دقايق)، واختبار stale QR.

### R1-F14 · P2 · إعادة إرسال jobs حالتها `provider_changed`
- **القسم:** سطر 104 و116.
- **السيناريو:** بعد تغيير الـ provider، jobs ما اتحاولتش خالص بتقف في review، و`wa_retry_delivery` ما بيقدرش يربطها بالـ provider الجديد. النتيجة: رسايل عملاء مدفوعة متعلقة.
- **التصحيح:** action صريح `requeue_on_current_provider` للـ jobs اللي `attempt_count=0` بس: يعيد ربط provider/account/revision مع audit، والمحتوى ما يتغيرش، مع bulk action.

### R1-F15 · P2 · طريقة تنفيذ رسايل المحادثة اليدوية مش محددة
- **القسم:** Task 6 سطر 211–212، وسطر 116.
- **السيناريو:** لو الرسالة اليدوية مستنية الـ scheduler، هتتأخر حوالي 60 ثانية. ومع slot واحد للحساب، و3 jobs في كل run، وrun كل دقيقة، الـ throughput بيبقى حوالي 3 رسايل في الدقيقة.
- **التصحيح:**
  - inline claim لنفس الـ `job_id` مع timeout قصير، ونتيجة `busy` تبقى queued مع nudge.
  - الـ nudge يفضّي الطابور.
  - هدف latency واضح، واختبار تزاحم بين manual والـ worker.

### R1-F16 · P2 · بيئة الـ DB للاختبار غير معرّفة، ومفيش اختبار تكامل Deno مع SQL
- **القسم:** Task 2 سطر 164، وTask 3 سطر 175، وTask 13 سطر 281.
- **الناقص:**
  - مش محدد الـ image (pinned).
  - ولا إزاي `orders` و`order_items` و`payment_attempts` و`user_roles` و`has_role` و`auth.uid()` و`storage.buckets` هتوصل.
  - ولا هل كل migrations الـ repo هتتطبق الأول.
  - ومفيش اختبار يربط شكل الـ JSON بين Deno والـ RPCs. اختبارات Deno كلها mocks.
- **التصحيح:**
  - تعريف الـ baseline.
  - اختبار تكامل واحد على edge runtime محلي + DB مؤقتة مع provider مزيف: webhook → RPC → jobs → worker.

### R1-F17 · P2 مشروطة · مفتاح Postora القديم
- **القسم:** Task 4 سطر 188.
- **الوضع الحالي:** `AdminWhatsApp.tsx:122-125` بيكتب `api_key` في `site_settings` من المتصفح.
- **السيناريو:** لو `site_settings` مقروء لـ anon، المفتاح مكشوف دلوقتي فعلًا، والتشفير لوحده مش هيلغي الكشف ده. وكمان أي bundle قديم مفتوح عند أدمن ممكن يرجّع يكتب المفتاح تاني.
- **التصحيح:**
  - فحص الـ RLS.
  - لو المفتاح مكشوف: rotate عند الـ cutover.
  - منع كتابة `api_key` داخل `whatsapp_integration` بعد الترحيل (trigger أو policy).

### R1-F18 · P2 · فحص المبلغ في مسار الـ webhook
- **القسم:** سطر 122.
- **السيناريو:** التوقيع بيغطي 5 حقول بس. الخطة بتعتمد على GET "where required"، بس سلوك الـ webhook لو الـ GET فشل مش معرّف: هل يرجع 5xx ويعيد، ولا يعلّم paid من غير مبلغ؟
- **الدليل:** `payment-security.ts:17-23`.
- **التصحيح:** قاعدة صريحة لكل حالة، مع اختبار.

---

## P3: تحسينات

### R1-F19 · ترتيب الـ locks
- الـ lock order (سطر 114) ناقص `wa_retry_delivery` و`wa_expire_delivery_leases` و`wa_apply_ack`.
- محتاج تحديد الـ lock modes: `FOR SHARE` للـ claim والدفع، و`FOR UPDATE` للـ save والـ activate.
- محتاج تأكيد إن الـ claim بيقرا الـ order من غير lock، وإن الإلغاء بيتفحص عند الـ claim بس.

### R1-F20 · الـ scheduler والـ runtime
- جملة "Empty authenticated scheduler run updates heartbeat" (سطر 212) يتفهم منها إن الـ heartbeat بيتحدث في الـ runs الفاضية بس. الصح: كل scheduler run.
- إضافة `flock` لمنع تداخل الـ cron.
- Task 14 سطر 292 "Verify required routes" قبل الـ merge مستحيل، لأن الـ functions بتتنشر بس عند الـ merge (`supabase-post-deploy.sh:429-473`). الأدق: disposable env أو بعد الـ merge.
- `DENO_DIR` لازم يبقى تحت `F:\Dev\Runtimes`.
- صلاحيات `--allow-read` للـ fixtures.

### R1-F21 · ترحيل الإعدادات الحالية
- ربط الـ templates والـ `events` الموجودة في `site_settings.whatsapp_integration` (`order_paid_ar`، إلخ) بالـ audience templates/switches الجديدة.
- اختبار إن `user_notification_templates` مش مربوط ضمنيًا (spec §5).

### R1-F22 · هوية الراسل مع Postora
- لما Postora يبقى active، الرد من الـ inbox ممكن يطلع من رقم غير الرقم اللي العميل كلّمه. يتعرض الحساب اللي هيبعت في الـ composer.
- Task 0 يسجل هل Postora بيرجّع الـ WA message key id عشان echo dedupe.

---

## الحكم

**مش جاهزة للتنفيذ.**
- R1-F1 وR1-F2: تعديل في الخطة.
- R1-F3: قرار من المستخدم.
- P2: لازم تتحل أو يترفض كل واحد منها بسبب صريح قبل Task 1.
- الجولة 2 تعيد قراية الأقسام بعد التعديل: "Trusted paid event and email boundary"، وTask 5 و6، وTask 0 و14.
- مفيش finding فيها بيطلب تغيير في الـ spec؛ المطلوب الحل جوّه البنود المذكورة أو قرار من المستخدم.

## حدود اللي اتحقق منه
- ما تحققتش من الـ SHA256 للوثيقتين (الـ shell ممنوع).
- مش متحقق منه:
  - حالة الإيقاف الوزاري live
  - RLS لـ `site_settings` وصيغ أرقام العملاء (الـ migrations مش ضمن القراءات المسموحة)
  - سلوك `v2.3.7` في الـ retry والـ headers والـ base64
  - هل الـ T3 worktree بيبدأ من main
  - وجود `scripts/apply-self-hosted-migrations.sh` نفسه؛ ما قريتهوش، والاستنتاج مبني على `SELF_HOSTED.md` و`supabase-post-deploy.sh`
- grep واحد على donor `src/` كله (عن `markMessageAsRead`) طلع برّه قائمة ملفات الـ donor المسموحة، وما رجّعش نتايج.
- ما عدّلتش أي حاجة، ولا شغّلت اختبارات أو network.
- مش أقدر أأكد إن المهمة دي اشتغلت بـ `effort=high` المكتوب في الخطة؛ اتأكد من dispatch options قبل ما تحسبها جولة 1.
