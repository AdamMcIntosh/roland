namespace FlowForge.Api.Configuration;

public sealed class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Issuer { get; init; } = "FlowForge";
    public string Audience { get; init; } = "FlowForge";
    public string SecretKey { get; init; } = string.Empty;
}
