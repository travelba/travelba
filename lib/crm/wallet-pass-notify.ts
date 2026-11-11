import { walletPassSignedPath } from "./boarding-pass-link";
import { walletPassNotice, walletPassPublicUrl } from "./boarding-pass-whatsapp";
import { freeMessageContentVariables, FREE_MESSAGE_TEMPLATE_ENV } from "./free-message-whatsapp";
import { resolveContentSid, whatsappContentApproved } from "./twilio-content-sid";
import { sendContentTemplate, type WhatsappSendResult } from "./whatsapp";

type WalletSend = (input: {
  phone: string | null | undefined;
  contentSid: string;
  variables: Record<string, string> | null;
}) => Promise<WhatsappSendResult>;

/** Second message, seulement si le modèle libre est approuvé. L’échec ne retire pas le PDF. */
export async function deliverWalletNotice(input: {
  phone: string | null | undefined;
  firstName: string;
  documentId: string;
  send?: WalletSend;
}) {
  try {
    const text = walletPassNotice(input.firstName, walletPassPublicUrl(walletPassSignedPath(input.documentId)));
    if (!text) return false;
    const contentSid = (await resolveContentSid(FREE_MESSAGE_TEMPLATE_ENV.message_libre_texte)).trim();
    if (!contentSid || !(await whatsappContentApproved(contentSid))) return false;
    const variables = freeMessageContentVariables("message_libre_texte", {
      firstName: input.firstName,
      text,
    });
    if (!variables) return false;
    const result = await (input.send ?? sendContentTemplate)({ phone: input.phone, contentSid, variables });
    return result.ok;
  } catch {
    return false;
  }
}
