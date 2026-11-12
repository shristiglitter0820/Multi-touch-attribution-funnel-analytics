# Integration dependencies: status after integration

Earlier open questions (see the previous version of this file) and how they were resolved:

| Question | Resolution |
|---|---|
| Schema freeze / which schema | Member 2's schema is canonical; Member 1's concepts mapped onto it (INTEGRATION.md section 2). Member 1 must confirm. |
| Funnel inputs from the pipeline | Implemented: CLICK/IMPRESSION -> touchpoint, VISIT/ADD_TO_CART/PURCHASE -> funnel_event, sessions by 30-minute rule |
| Attribution output | `attribution_credit` filled automatically for FIRST_TOUCH, LAST_TOUCH, LINEAR (rule reproduces Member 1's 14 sample rows) |
| ROI / CTR / conversion rate | Not in Member 1's handoff; implemented as views `v_campaign_roi` and `v_attribution_by_channel` and the Attribution page |
| MongoDB contract | Db `adtech_analytics`, collection `ad_events`, document shape from Member 1's validator (user_id, event_type, channel, ad_id, device_type, event_time, received_at, revenue, order_reference, session_id) |
| Shared API contract / authentication | Same paths as Member 1's server; `x-api-key` for machines, ADMIN session for the browser |
| Schema gaps | conversion relaxed (revenue >= 0, order_ref 100, several orders per session); `ad.status` still has no DB CHECK (validated in the API only) |
| Timezone | Spend is computed on UTC dates; event times are timestamptz |

## Still open for Member 1 to confirm
1. Replacing their schema with the canonical one (section 8.1 of INTEGRATION.md).
2. Whether IMPRESSION/CLICK without an ad_id should be allowed (currently rejected with a reason).
3. Look-back window / TIME_DECAY requirements.
4. Who owns a scheduler for synchronisation (currently a button / API call).
