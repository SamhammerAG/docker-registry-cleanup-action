import * as core from "@actions/core";
import fetch, { type RequestInit } from "node-fetch";
import https from "https";
import { BASIC, BEARER, buildAuthorizationHeader } from "http-auth-utils";
import { parseHTTPHeadersQuotedKeyValueSet } from "http-auth-utils/dist/utils";

interface RegistryRequestInit extends RequestInit {
    registry: string;
    credentials: { username: string; password: string };
}

class TagNotFoundError extends Error {}

interface TokenResponse {
    token: string;
}

async function run(): Promise<void> {
    const inputs = {
        registry: prepareUrl(core.getInput("registry")),
        registry_path: trimSlash(core.getInput("registry_path")),
        registry_user: core.getInput("registry_user"),
        registry_password: core.getInput("registry_password"),
        tag: trimSlash(core.getInput("tag")),
        ignoreNotFound: core.getBooleanInput("ignoreNotFound")

    };

    try {
        await deleteTag(
            inputs.registry_path,
            inputs.tag,
            {
                registry: inputs.registry,
                credentials: {
                    username: inputs.registry_user,
                    password: inputs.registry_password,
                },
            }
        );
    } catch (error) {
        if (error instanceof TagNotFoundError && inputs.ignoreNotFound){
            console.log(error.message);
        } else {
            core.setFailed((error as Error).message);
        }
    }
}

async function deleteTag(
    path: string,
    tagName: string,
    opts: RegistryRequestInit
): Promise<void> {
    const tagDigest = await getTagDigest(path, tagName, opts);
    await deleteTagByDigest(path, tagDigest, opts);
}

async function getTagDigest(path: string, tagName: string, opts: RegistryRequestInit) {
    const url = `${path}/manifests/${tagName}`;

    const response = await request(url, {
        ...opts,
        headers: {
            ...opts.headers,
            Accept: "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json",
        },
    });

    if (response.status === 404) {
        throw new TagNotFoundError(`Tag ${tagName} does not exist in ${path} of registry ${opts.registry}`);
    }

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Fetching tag infos failed with status ${response.status}: ${responseText}`);
    }

    const tagDigest = await response.headers.get("docker-content-digest");

    if (!tagDigest) {
        throw new Error(`Tag digest header of the manifest was empty.`);
    }

    return tagDigest;
}

async function deleteTagByDigest(path: string, tagDigest: string, opts: RegistryRequestInit) {
    const url = `${path}/manifests/${tagDigest}`;

    const response = await request(url, {
        ...opts,
        method: "DELETE"
    });

    if (response.status === 404) {
        throw new TagNotFoundError(`Tag digest ${tagDigest} does not exist in ${path} of registry ${opts.registry}`);
    }

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Deleting tag failed with status ${response.status}: ${responseText}`);
    }
}

async function request(endpoint: string, opts: RegistryRequestInit) {
    const url = `${opts.registry}/v2/${endpoint}`;
    const token = await getAuthToken(url, opts);
    const authHeader = buildAuthorizationHeader(BEARER, { hash: token });
    const agent = new https.Agent();

    return await fetch(url, {
        ...opts,
        agent: agent,
        headers: {
            Authorization: authHeader,
            ...opts.headers,
        },
    });
}

async function getAuthToken(
    actionUrl: string,
    opts: RegistryRequestInit
): Promise<string> {
    const authInfos = await getAuthInfos(actionUrl, opts);
    const url = `${authInfos.realm}?service=${authInfos.service}&scope=${authInfos.scope}`;
    const basicAuthHeader = buildAuthorizationHeader(BASIC, {
        username: opts.credentials.username,
        password: opts.credentials.password,
    });

    const response = await fetch(url, {
        headers: {
            Authorization: basicAuthHeader,
        },
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Auth failed with status ${response.status}: ${responseText}`);
    }

    const responseJson = (await response.json()) as TokenResponse;
    return responseJson.token;
}

async function getAuthInfos(
    actionUrl: string,
    opts: RegistryRequestInit
) {
    // Url of the action that is executed later. This is required for correct scope
    const response = await fetch(actionUrl, {
        ...opts
    });

    const wwwAuthString = response.headers.get("www-authenticate");

    if (!wwwAuthString) {
        const responseText = await response.text();
        throw new Error(`Could not fetch authentication info from request with status ${response.status}: ${responseText}`);
    }

    const requiredFields = ["realm", "service", "scope" ];
    return parseHTTPHeadersQuotedKeyValueSet(wwwAuthString, requiredFields);
}

function prepareUrl(input: string): string {
    const urlWithoutTrailingSlash = input.replace(/\/$/, '');

    if (!/^(?:f|ht)tps?:\/\//.test(urlWithoutTrailingSlash)) {
        return 'https://' + urlWithoutTrailingSlash
    }

    return urlWithoutTrailingSlash;
}

function trimSlash(input: string): string {
    return input.replace(/^\/|\/$/g, '');
}

run();
