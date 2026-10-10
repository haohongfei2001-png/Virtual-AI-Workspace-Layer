/** Default is the real browser. The opaque-page dependency injection exists ONLY
 * for set_content DOM tests where administrator policy prohibits navigation.
 * It never grants identity, storage or MV3 evidence. */
const test=globalThis.__VAIWL_HF_OPAQUE_TEST__;
export const env=(location.protocol==='about:'&&test?.kind==='OPAQUE_DOM_ONLY')
  ?test:{location,history};
