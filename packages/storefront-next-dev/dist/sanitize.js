//#region src/audit/sanitize.ts
/**
* Copyright 2026 Salesforce, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
const bearer = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const secretKey = new RegExp(`\\b([\\w-]{0,64}?)(?:api[_-]?key|api[_-]?signature|access[_-]?token|token|secret|password|passwd|authorization|set-cookie|cookie|session[_-]?id|sessionid|credentials?|csrf[_-]?token|private[_-]?key)(?:[_-]?(?:access[_-]?)?(?:key|value|hash|id|token))?\\\\?["']?\\s*[:=]\\s*`, "gi");
const knownToken = /(?<![\w-])eyJ[\w-]{1,1024}\.eyJ[\w-]{1,16384}\.[\w-]*|\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}|\bwhsec_[A-Za-z0-9]{20,}|\bgh[opsru]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}|\bnpm_[A-Za-z0-9]{36}\b|\bx(?:ox[abeprs]|app)-(?![\w-]{0,253}\.[A-Za-z])[A-Za-z0-9-]{10,}|\bsk-(?:ant|proj)-(?![\w-]{0,253}\.[A-Za-z])[\w-]{20,}|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|(?<=hooks\.slack\.com\/services\/)[A-Za-z0-9/]+/g;
const pemBegin = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/;
const pemEnd = /-----END [A-Z ]{0,40}PRIVATE KEY-----/;
const pemLine = /(?:[ \t]*(?:\r?\n|(?:\\r)?\\n))*[ \t]*(?:(?:Proc-Type|DEK-Info):[^\r\n\\]*|[A-Za-z0-9+/=]{16,})/y;
const maxKeyLength = 16384;
/** Not after `@` or `~`: `@/components/header` and `~/lib` are import aliases, not files on disk. */
const absolutePath = /(?<![\w.@~-])(?:[A-Za-z]:[\\/]|\/)(?:[^\s<>'"`]+[\\/])+[^\s<>'"`,.;:]*/g;
const webUrl = /https?:\/\/[^\s<>'"`]+/gi;
/** Returns the first match at or after an index. Indexes must not decrease; reusing the last match keeps repeated searches linear. */
function finder(pattern, text) {
	const global = new RegExp(pattern.source, "g");
	let found;
	return (from) => {
		if (found === void 0 || found && found.index < from) {
			global.lastIndex = from;
			found = global.exec(text);
		}
		return found;
	};
}
/** Redacts each private key from its BEGIN line to its END line. A key without an END line before the next key
* (or within maxKeyLength) is redacted up to its last key-like line, so prose after a lone header stays. */
function redactPrivateKeys(text) {
	const nextBegin = finder(pemBegin, text);
	const nextEnd = finder(pemEnd, text);
	let out = "";
	let last = 0;
	for (let begin = nextBegin(0); begin; begin = nextBegin(last)) {
		const start = begin.index + begin[0].length;
		const end = nextEnd(start);
		const following = nextBegin(start);
		let stop = start;
		if (end && end.index - start <= maxKeyLength && (!following || following.index > end.index)) stop = end.index + end[0].length;
		else for (pemLine.lastIndex = stop; pemLine.exec(text); pemLine.lastIndex = stop) stop = pemLine.lastIndex;
		out += `${text.slice(last, begin.index)}[REDACTED]`;
		last = stop;
	}
	return out + text.slice(last);
}
const quoteAt = (text, index) => {
	if (text[index] === "\"" || text[index] === "'") return text[index];
	return text[index] === "\\" && (text[index + 1] === "\"" || text[index + 1] === "'") ? text.slice(index, index + 2) : "";
};
const lineEnd = (text, index) => {
	const end = text.indexOf("\n", index);
	return end === -1 ? text.length : end;
};
const skip = (text, index, pattern) => {
	while (index < text.length && pattern.test(text.charAt(index))) index++;
	return index;
};
const wordChar = /[^\s"',;}&\\]/;
const tokenChar = /[\w.~+/=-]/;
const schemeCredential = /[ \t]+[^\s"',;}&\\]+/y;
/**
* Reads the value that starts at `start`: a quoted string up to its unescaped closing quote, a list or object up
* to its matching bracket (plus any token glued to it), an auth scheme with its credential, or one word. An
* unclosed quote or bracket takes the rest of the line. `core` is the value without its quotes.
*/
function scanValue(text, start) {
	const quote = quoteAt(text, start);
	if (quote) {
		for (let index = start + quote.length; index < text.length && text[index] !== "\n"; index += text[index] === "\\" && text[index + 1] !== "\n" ? 2 : 1) if (text.startsWith(quote, index)) return {
			end: index + quote.length,
			quote,
			core: text.slice(start + quote.length, index)
		};
	} else if (text[start] === "[" || text[start] === "{") {
		let depth = 0;
		let inQuote = "";
		for (let index = start; index < text.length && text[index] !== "\n"; index++) {
			if (inQuote) {
				if (text.startsWith(inQuote, index)) {
					index += inQuote.length - 1;
					inQuote = "";
				} else if (text[index] === "\\") index++;
				continue;
			}
			inQuote = quoteAt(text, index);
			if (inQuote) index += inQuote.length - 1;
			else if (text[index] === "[" || text[index] === "{") depth++;
			else if ((text[index] === "]" || text[index] === "}") && --depth === 0) {
				const end$1 = skip(text, index + 1, tokenChar);
				return {
					end: end$1,
					quote: "",
					core: text.slice(start, end$1)
				};
			}
		}
	} else {
		let end$1 = skip(text, start, wordChar);
		if (/^(?:Basic|Bearer|Digest|Token)$/i.test(text.slice(start, end$1))) {
			schemeCredential.lastIndex = end$1;
			if (schemeCredential.exec(text)) end$1 = schemeCredential.lastIndex;
		}
		return {
			end: end$1,
			quote: "",
			core: text.slice(start, end$1)
		};
	}
	const end = lineEnd(text, start);
	return {
		end,
		quote: "",
		core: text.slice(start, end)
	};
}
/** Values that can't be secrets: an exact placeholder, booleans and null under any name (`hasPassword: true`),
* and numbers under a page, count or limit name (`pageToken=2`). */
function keepValue(prefix, value) {
	return /^(?:\[REDACTED\]|(?:Basic|Bearer|Digest|Token) \[REDACTED\]|true|false|null|undefined)$/i.test(value) || /^-?\d+(?:\.\d+)?$/.test(value) && /page|max|min|count|limit|total|num/i.test(prefix);
}
/** Redacts the value of every secret-named assignment. Each value is read and decided on once, and the search
* resumes after it, so a value is never rewritten twice and the work stays linear. */
function redactAssignments(text) {
	let out = "";
	let last = 0;
	secretKey.lastIndex = 0;
	for (let key = secretKey.exec(text); key; key = secretKey.exec(text)) {
		const start = key.index + key[0].length;
		const { end, quote, core } = scanValue(text, start);
		if (end === start) continue;
		if (!keepValue(key[1] ?? "", core)) {
			const scheme = /^(Basic|Bearer|Digest|Token)\s+\S/i.exec(core)?.[1];
			out += `${text.slice(last, start)}${quote}${scheme ? `${scheme} ` : ""}[REDACTED]${quote}`;
			last = end;
		}
		secretKey.lastIndex = end;
	}
	return out + text.slice(last);
}
function sanitizeUrl(value) {
	const parsed = new URL(value);
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL must use https (or http with --allow-http)");
	parsed.username = "";
	parsed.password = "";
	for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, "[REDACTED]");
	parsed.hash = "";
	return parsed.toString();
}
function sanitizeText(value) {
	const urls = [];
	let sanitized = redactPrivateKeys(value.replaceAll("\0", "")).replace(knownToken, "[REDACTED]").replace(webUrl, (url) => {
		try {
			urls.push(sanitizeUrl(url));
			return `\u0000URL${urls.length - 1}\u0000`;
		} catch {
			return "[REDACTED_URL]";
		}
	});
	sanitized = redactAssignments(sanitized.replace(bearer, "Bearer [REDACTED]")).replace(absolutePath, "[REDACTED_PATH]");
	return sanitized.replace(/\u0000URL(\d+)\u0000/g, (match, index) => urls[Number(index)] ?? match);
}
function sanitizeJsonValue(value, key) {
	if (typeof value === "string") {
		if (key === "pointer" && value.startsWith("/")) return value.split("/").map((token, index) => index === 0 ? "" : sanitizeText(token)).join("/");
		return sanitizeText(value);
	}
	if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeJsonValue(child, childKey)]));
	return value;
}

//#endregion
export { sanitizeText as n, sanitizeUrl as r, sanitizeJsonValue as t };