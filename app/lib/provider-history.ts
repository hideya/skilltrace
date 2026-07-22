export function withProviderExecutionIdentity(
  context?: Record<string, any> | null,
  history?: Record<string, any> | null,
) {
  let identity = providerExecutionIdentity(history)
  if (!identity.model && !identity.client) return context

  return {
    ...(context || {}),
    ...(identity.model ? { model: identity.model } : {}),
    ...(identity.client ? { client: identity.client } : {}),
  }
}

export function providerExecutionIdentity(
  history?: Record<string, any> | null,
) {
  if (!history?.provider_session_id) return {}

  let environment = providerEnvironment(history)
  let name = stringValue(environment.client) || capitalize(history.provider)
  let version =
    stringValue(environment.client_version) ||
    stringValue(history.provider_client_version)

  return {
    model:
      stringValue(environment.model) || stringValue(history.provider_model),
    client: [name, version].filter(Boolean).join(' ') || undefined,
  }
}

function providerEnvironment(history: Record<string, any>) {
  let value = history.provider_environment
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function capitalize(value: unknown) {
  let text = stringValue(value)
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : undefined
}
