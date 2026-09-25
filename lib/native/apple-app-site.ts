export const CLIENT_APP_BUNDLE = "fr.travelba.espace";

export const CLIENT_APP_PATHS = [
  "/mon-compte",
  "/mon-compte/*",
  "/connexion",
  "/connexion/*",
  "/e/*",
  "/auth/callback",
] as const;

export function appleAppSiteAssociation(teamId: string | undefined) {
  const team = teamId?.trim() || "TEAMID";
  return {
    applinks: {
      apps: [] as string[],
      details: [
        {
          appID: `${team}.${CLIENT_APP_BUNDLE}`,
          paths: [...CLIENT_APP_PATHS],
        },
      ],
    },
  };
}
