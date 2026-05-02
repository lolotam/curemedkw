export const getAuthRedirectUrl = () => {
  const origin = window.location.origin;
  if (origin.includes("localhost")) return `${origin}/auth/callback`;
  if (origin.includes("lovable.app")) return `${origin}/auth/callback`;
  return "https://curemedkw.com/auth/callback";
};
