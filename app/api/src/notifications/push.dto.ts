import { Type } from 'class-transformer';
import {
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Base64url, with the optional `=` padding browsers sometimes include.
 * A public key is 65 raw bytes (~87 chars) and the auth secret 16 (~22), so the
 * length caps below are generous but bounded.
 */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * The only hosts a browser push endpoint may live on: the three services the
 * spec cares about (Chrome/FCM, Firefox autopush, Safari/APNs).
 *
 * An allowlist rather than "reject private ranges": the server performs the
 * request, so an endpoint of `https://example.com/push` is still an SSRF sink
 * (it makes us POST attacker-chosen bodies to an arbitrary public address, and
 * whatever we do not allow is rejected regardless of what it resolves to
 * later). Exact hosts are listed individually; the services that hand out
 * per-tenant subdomains are matched by suffix.
 */
const EXACT_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

const PUSH_HOST_SUFFIXES = [
  '.push.services.mozilla.com',
  '.notify.windows.com',
  '.push.apple.com',
];

/** True when a real Web Push service owns this host. */
function isPushServiceHost(host: string): boolean {
  if (EXACT_PUSH_HOSTS.has(host)) {
    return true;
  }

  return PUSH_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
}

/**
 * A push endpoint is a URL handed out by the browser's push service. It must be
 * an https URL on one of those services, with no port other than the default
 * (443): anything else would let a signed-in user point our server at an
 * arbitrary address, and the server is the one making the request (SSRF sink).
 */
@ValidatorConstraint({ name: 'isPushEndpoint', async: false })
class PushEndpointConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length > 2048) {
      return false;
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }

    if (url.protocol !== 'https:') {
      return false;
    }

    // An explicit port is only acceptable when it is the default https one.
    if (url.port !== '' && url.port !== '443') {
      return false;
    }

    // `URL` keeps IPv6 literals bracketed; a push service never uses one.
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    return Boolean(host) && isPushServiceHost(host);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} phải là URL https của một dịch vụ push được hỗ trợ.`;
  }
}

export class PushSubscriptionKeysDto {
  @IsString()
  @MaxLength(200)
  @Matches(BASE64URL, { message: 'p256dh không hợp lệ.' })
  p256dh!: string;

  @IsString()
  @MaxLength(64)
  @Matches(BASE64URL, { message: 'auth không hợp lệ.' })
  auth!: string;
}

export class SubscribePushDto {
  @IsString()
  @MaxLength(2048)
  @Validate(PushEndpointConstraint)
  endpoint!: string;

  // Nested validation needs both decorators: `@Type` so class-transformer
  // builds the class instance, `@ValidateNested` so the child rules run.
  // The global pipe's whitelist would otherwise strip `keys` entirely.
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  @MaxLength(2048)
  @Validate(PushEndpointConstraint)
  endpoint!: string;
}
