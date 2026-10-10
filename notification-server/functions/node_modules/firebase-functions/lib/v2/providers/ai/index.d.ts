import { CloudEvent } from "../../core";
import { HttpsFunction, HttpsError, FunctionsErrorCode } from "../https";
import { EventHandlerOptions } from "../../options";
export { HttpsError };
/**
 * Mapping from `FunctionsErrorCode` strings to numeric RPC status codes.
 */
export declare const rpcCodeMap: Record<FunctionsErrorCode, number>;
import { type GenerateContentRequest as VertexV1Beta1GenerateContentRequest, type GenerateContentResponse as VertexV1Beta1GenerateContentResponse } from "./types/vertex/v1beta1";
import { type GenerateContentRequest as GeminiV1BetaGenerateContentRequest, type GenerateContentResponse as GeminiV1BetaGenerateContentResponse } from "./types/gemini/v1beta";
export { type VertexV1Beta1GenerateContentRequest, type VertexV1Beta1GenerateContentResponse, type GeminiV1BetaGenerateContentRequest, type GeminiV1BetaGenerateContentResponse, };
/**
 * Options for configuring AI webhook triggers.
 */
export interface WebhookOptions extends EventHandlerOptions {
}
/**
 * Metadata about the server prompt template used, if applicable.
 */
export interface PromptTemplateInfo {
    /** The name of the server prompt template. */
    templateName?: string;
}
/**
 * Authentication state for the caller: `"app_user"`, `"unauthenticated"`, or `"unknown"`.
 */
export type AuthType = "app_user" | "unauthenticated" | "unknown";
/**
 * Event type for `beforeGenerate` triggers.
 */
export declare const beforeGenerateEventType = "google.firebase.ailogic.v1.beforeGenerate";
/**
 * Event type for `afterGenerate` triggers.
 */
export declare const afterGenerateEventType = "google.firebase.ailogic.v1.afterGenerate";
/**
 * Union of all valid AI request payloads across supported Gemini API providers.
 */
export type AnyValidAIRequest = GeminiV1BetaGenerateContentRequest | VertexV1Beta1GenerateContentRequest;
/**
 * Union of all valid AI response payloads across supported Gemini API providers.
 */
export type AnyValidAIResponse = GeminiV1BetaGenerateContentResponse | VertexV1Beta1GenerateContentResponse;
/**
 * Identifier for the Gemini Developer API (`geminiV1Beta`).
 */
export declare const geminiV1Beta = "google.ai.generativelanguage.v1beta";
/**
 * Identifier for the Agent Platform Gemini API (formerly Vertex AI) (`vertexV1Beta1`).
 */
export declare const vertexV1Beta1 = "google.cloud.aiplatform.v1beta1";
/**
 * Supported Gemini API providers: Gemini Developer API or Agent Platform Gemini API (formerly Vertex AI).
 */
export type SupportedAPI = typeof geminiV1Beta | typeof vertexV1Beta1;
/**
 * Generic type resolving to the corresponding AI request type based on the API identifier.
 */
export type AIRequest<API> = string extends API ? AnyValidAIRequest : API extends typeof geminiV1Beta ? GeminiV1BetaGenerateContentRequest : API extends typeof vertexV1Beta1 ? VertexV1Beta1GenerateContentRequest : never;
/**
 * Generic type resolving to the corresponding AI response type based on the API identifier.
 */
export type AIResponse<API> = string extends API ? AnyValidAIResponse : API extends typeof geminiV1Beta ? GeminiV1BetaGenerateContentResponse : API extends typeof vertexV1Beta1 ? VertexV1Beta1GenerateContentResponse : never;
/**
 * Data payload for `beforeGenerateContent` events.
 */
export interface BeforeGenerateContentData<API extends string = string> {
    /** The full model resource path (for example, `projects/{PROJECT_ID}/locations/global/publishers/google/models/gemini-3.5-flash`). */
    model: string;
    /** Metadata about the server prompt template used, if applicable. */
    template?: PromptTemplateInfo;
    /** The Gemini API provider: `geminiV1Beta` (Gemini Developer API) or `vertexV1Beta1` (Agent Platform Gemini API (formerly Vertex AI)). */
    api: SupportedAPI;
    /** The outgoing request payload. */
    request: AIRequest<API>;
}
/**
 * Data payload for `afterGenerateContent` events.
 */
export interface AfterGenerateContentData<API extends string = string> extends BeforeGenerateContentData<API> {
    /** The model's response payload. */
    response: AIResponse<API>;
}
/**
 * Event context and metadata delivered to AI blocking handlers.
 */
export interface AIBlockingEvent<T = any> extends CloudEvent<T> {
    /** Authentication state for the caller: `"app_user"`, `"unauthenticated"`, or `"unknown"`. */
    authType: AuthType;
    /** The caller's Firebase Authentication UID, if signed in. */
    authId?: string;
    /** The caller's custom auth claims, if any. */
    authClaims?: any;
    /** The resource name of the caller or request. */
    resourceName?: string;
    /** The Firebase App ID that made the request. */
    appId?: string;
    /** The display name of the calling app, if set. */
    displayName?: string;
    /** The package name of the calling app (applicable only for apps that target Android platforms). */
    androidPackageName?: string;
    /** The bundle ID of the calling app (applicable only for apps that target Apple platforms). */
    iosBundleId?: string;
}
type MaybeAsync<T> = T | Promise<T>;
/**
 * A function that handles AI blocking events.
 */
export type BlockingFunction = HttpsFunction;
/**
 * Handles an event triggered before content is generated by an AI model.
 * @param callback - Event handler run before content generation.
 * @returns A blocking function that can be exported and deployed.
 */
export declare function beforeGenerateContent(callback: (event: AIBlockingEvent<BeforeGenerateContentData>) => MaybeAsync<void | Partial<AnyValidAIRequest>>): BlockingFunction;
/**
 * Handles an event triggered before content is generated by an AI model.
 * @param options - Configuration options for the webhook.
 * @param callback - Event handler run before content generation.
 * @returns A blocking function that can be exported and deployed.
 */
export declare function beforeGenerateContent(options: WebhookOptions, callback: (event: AIBlockingEvent<BeforeGenerateContentData>) => MaybeAsync<void | Partial<AnyValidAIRequest>>): BlockingFunction;
/**
 * Handles an event triggered after content is generated by an AI model.
 * @param callback - Event handler run after content generation.
 * @returns A blocking function that can be exported and deployed.
 */
export declare function afterGenerateContent(callback: (event: AIBlockingEvent<AfterGenerateContentData>) => MaybeAsync<void | Partial<AnyValidAIResponse>>): BlockingFunction;
/**
 * Handles an event triggered after content is generated by an AI model.
 * @param options - Configuration options for the webhook.
 * @param callback - Event handler run after content generation.
 * @returns A blocking function that can be exported and deployed.
 */
export declare function afterGenerateContent(options: WebhookOptions, callback: (event: AIBlockingEvent<AfterGenerateContentData>) => MaybeAsync<void | Partial<AnyValidAIResponse>>): BlockingFunction;
