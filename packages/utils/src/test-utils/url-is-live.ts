export async function urlIsLive(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch (err) {
    return false;
  }
}
