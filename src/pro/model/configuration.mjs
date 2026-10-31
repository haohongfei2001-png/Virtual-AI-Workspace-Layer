import {boundedJSON, boundedText, exact, integer} from './schema-runtime.mjs';
import {validatePriceCard} from '../jobs/budget.mjs';

/** Configuration contains no secret and grants no execution/quality authority.
 * A profile is frozen for one task; the owner must supply current purpose,
 * destination and billing permission separately at dispatch time. */
export function validateModelProfile(input, {paid = true} = {}) {
  const profile = boundedJSON(input, {maxBytes: 8192});
  exact(profile, ['id', 'providerProfileId', 'frozenModelVersion', 'promptVersion', 'outputSchemaVersion',
    'inputKinds', 'maxInputTokens', 'maxOutputTokens', 'maxUtf8Bytes', 'priceCardVersion', 'qualityGateReference']);
  for (const key of ['id', 'providerProfileId', 'frozenModelVersion', 'promptVersion']) boundedText(profile[key], 128);
  if (profile.providerProfileId !== 'openai-responses' || profile.outputSchemaVersion !== 'vaiwl-pro-model-output/1') throw Error('unconfigured-provider-profile');
  for (const key of ['priceCardVersion', 'qualityGateReference']) if (profile[key] !== null) boundedText(profile[key], 128);
  if (paid && profile.priceCardVersion === null) throw Error('unconfigured-provider-profile');
  integer(profile.maxInputTokens, 131072); integer(profile.maxOutputTokens, 8192); integer(profile.maxUtf8Bytes, 32768);
  if (!profile.maxInputTokens || profile.maxOutputTokens < 16 || profile.maxUtf8Bytes < 256 ||
      !Array.isArray(profile.inputKinds) || !profile.inputKinds.includes('metadata') ||
      new Set(profile.inputKinds).size !== profile.inputKinds.length || profile.inputKinds.length > 3 ||
      profile.inputKinds.some(kind => !['metadata', 'selected-text', 'sent-user-input'].includes(kind))) throw Error('invalid-model-profile');
  return profile;
}

export function validateModelConfiguration(input, now, {requireCurrent = true} = {}) {
  const config = boundedJSON(input, {maxBytes: 16384});
  exact(config, ['schema', 'profile', 'priceCard', 'billingProfileId'], ['maxChargePerTaskMicros']);
  if (config.schema !== 'vaiwl-pro-model-configuration/1') throw Error('invalid-model-configuration');
  boundedText(config.billingProfileId, 128);
  config.maxChargePerTaskMicros ??= 0; integer(config.maxChargePerTaskMicros);
  config.profile = validateModelProfile(config.profile);
  if (typeof requireCurrent !== 'boolean') throw Error('invalid-model-configuration');
  config.priceCard = validatePriceCard(config.priceCard, requireCurrent ? now : config.priceCard?.validFrom);
  if (config.priceCard.version !== config.profile.priceCardVersion ||
      config.priceCard.providerProfileId !== config.profile.providerProfileId) throw Error('model-price-card-mismatch');
  return config;
}

export function modelBinding(profile) {
  const p = validateModelProfile(profile);
  return {modelProfileId: p.id, modelVersion: p.frozenModelVersion, promptVersion: p.promptVersion,
    outputSchemaVersion: p.outputSchemaVersion, priceCardVersion: p.priceCardVersion};
}

/** Public projection intentionally excludes credentials, policy IDs and source
 * data. A non-null quality reference is still not an approved automatic lane. */
export function publicModelConfiguration(input, now, options) {
  if (input === null || input === undefined) return {configured: false, provider: null, model: null,
    profileId: null, inputKinds: [], currency: null, automaticEnabled: false};
  const c = validateModelConfiguration(input, now, options);
  return {configured: true, provider: c.profile.providerProfileId, model: c.profile.frozenModelVersion,
    profileId: c.profile.id, inputKinds: [...c.profile.inputKinds], currency: c.priceCard.currency,
    automaticEnabled: false};
}
