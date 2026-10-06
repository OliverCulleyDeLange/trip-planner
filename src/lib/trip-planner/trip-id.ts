const tripIdPattern = /^[A-Za-z0-9_-]{32}$/;

export function validTripId(id: string | undefined): id is string {
  if (id === 'demo') return true;
  return Boolean(id && tripIdPattern.test(id));
}
