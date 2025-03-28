import { ENV } from "@/app/libs/env";
import Redis from "ioredis";
import { redisMock } from "./RedisMock";

import type {
	AuthenticatorTransportFuture,
	WebAuthnCredential,
} from "@simplewebauthn/server";

const getRedis = () => {
	console.log("ENV.REDIS_URL", ENV.REDIS_URL);
	if (!ENV.REDIS_URL) {
		console.log("No REDIS_URL found, using custom RedisMock");
		return redisMock;
	}

	console.log("Using Redis URL", ENV.REDIS_URL.replace(/[A-Z]/g, "-"));
	return new Redis(ENV.REDIS_URL);
};

const redis = getRedis();

const uint8ArrayToBase64 = (array: Uint8Array): string => {
	return Buffer.from(array).toString("base64");
};

const base64ToUint8Array = (base64: string): Uint8Array => {
	return new Uint8Array(Buffer.from(base64, "base64"));
};

const getChallengeKey = (identifier: string, rpId: string) => {
	const key = `challenge:${rpId}:${identifier}`;
	console.log("getChallengeKey", key);
	return key;
};

export const saveChallenge = async ({
	identifier,
	rpId,
	challenge,
}: {
	identifier: string;
	rpId: string;
	challenge: string;
}) => {
	const key = getChallengeKey(identifier, rpId);
	console.log("saveChallenge", key, challenge);
	return redis.set(key, challenge, "EX", ENV.CHALLENGE_TTL_SECONDS);
};

export const getChallenge = async ({
	identifier,
	rpId,
}: {
	identifier: string;
	rpId: string;
}): Promise<string | null> => {
	try {
		const key = getChallengeKey(identifier, rpId);
		console.log("getChallenge", key);

		// Add more detailed logging
		console.log("Current time:", new Date().toISOString());
		console.log("Is using Redis Mock:", !ENV.REDIS_URL);

		const result = await redis.get(key);
		console.log("getChallenge result:", result);

		if (!result) {
			console.warn(
				`Challenge not found for ${key}. This may cause authentication to fail.`,
			);
		}

		return result;
	} catch (error) {
		console.error("Error retrieving challenge:", error);
		return null;
	}
};

export const deleteChallenge = async ({
	identifier,
	rpId,
}: {
	identifier: string;
	rpId: string;
}) => {
	const key = getChallengeKey(identifier, rpId);
	console.log("deleteChallenge", key);
	return redis.del(key);
};

export type WebAuthnCredentialJSON = {
	id: string;
	publicKey: string;
	counter: number;
	transports: string[];
};

// TODO: we should persist the user in the database, aka postgres
export const getUser = async ({
	rpId,
	identifier,
}: {
	rpId: string;
	identifier: string;
}) => {
	try {
		const data = await redis.get(`user:${rpId}:${identifier}`);
		if (!data) return { identifier, credentials: [] };
		const user: {
			credentials: WebAuthnCredentialJSON[];
		} = JSON.parse(data);
		const credentials: WebAuthnCredential[] = user.credentials.map(
			(credential) => ({
				id: credential.id,
				publicKey: base64ToUint8Array(credential.publicKey),
				counter: credential.counter,
				transports: credential.transports
					? (credential.transports as AuthenticatorTransportFuture[])
					: undefined,
			}),
		);
		return {
			identifier,
			credentials,
		};
	} catch (error) {
		console.error("Error getting user by identifier", error);
		return null;
	}
};

// TODO: we should persist the user in the database, aka postgres
export const saveUser = async ({
	rpId,
	identifier,
	user,
}: {
	rpId: string;
	identifier: string;
	user: { credentials: WebAuthnCredential[] };
}) => {
	return redis.set(
		`user:${rpId}:${identifier}`,
		JSON.stringify({
			credentials: user.credentials.map((credential) => ({
				id: credential.id,
				publicKey: uint8ArrayToBase64(credential.publicKey),
				counter: credential.counter,
				transports: credential.transports,
			})),
		}),
	);
};
