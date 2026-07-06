// Почтовый адаптер: Resend (https://resend.com).
// Серверный код (nitro) — ключ берётся из окружения, на клиент не попадает.
// Использование (V1.x): приглашение пользователя при создании, уведомления
// об SLA-брешах и просроченных обещаниях, ежедневный дайджест очереди задач.

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const RESEND_URL = "https://api.resend.com/emails";

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "DebtFlow <noreply@debtflow.uz>";
  if (!apiKey) {
    // Демо-режим без ключа: письмо не отправляется, но поток не ломается
    console.warn("[mail] RESEND_API_KEY не задан — письмо пропущено:", msg.subject, "→", msg.to);
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${body}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, id: data.id };
}

// Шаблон приглашения нового пользователя (RBAC: создаётся админом своей организации)
export function inviteEmail(name: string, orgName: string, roleLabel: string, appUrl: string) {
  return {
    subject: `DebtFlow: вам открыт доступ (${roleLabel})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px">
        <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
        <p>Здравствуйте, ${name}!</p>
        <p>Организация <b>${orgName}</b> открыла вам доступ к платформе DebtFlow с ролью <b>${roleLabel}</b>.</p>
        <p><a href="${appUrl}/login" style="background:#1B3A5C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Войти в систему</a></p>
        <p style="color:#888;font-size:12px">Единая операционная система взыскания · debtflow.uz</p>
      </div>`,
  };
}
