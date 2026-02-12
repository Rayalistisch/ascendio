export async function postToWebhook(
  webhookUrl: string,
  payload: {
    articleTitle: string;
    articleUrl: string;
    socialCopy: string;
    imageUrl?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `Webhook returned ${response.status}: ${body.substring(0, 200)}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Webhook request failed",
    };
  }
}
