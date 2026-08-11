import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';

export type RephraseField = 'title' | 'description';

const MODEL = 'llama-3.3-70b-versatile';

// Wraps the Groq SDK the same way EmailService wraps SMTP: the client is
// built once from an env var, and every call site here is the only place
// in the codebase that touches the third-party SDK directly.
//
// No dev-mode fallback like EmailService's console log — there is no
// sensible placeholder output for "rephrase this text", so an unconfigured
// key is a real error, not a degraded-but-working path.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Groq | null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    this.client = apiKey ? new Groq({ apiKey }) : null;
  }

  async rephraseJobField(field: RephraseField, text: string): Promise<string> {
    if (!this.client) {
      this.logger.error('Rephrase requested but GROQ_API_KEY is not set');
      throw new BadGatewayException('AI rephrasing is not configured');
    }

    // Matches CreateJobDto's own limits (job.dto.ts), so the model is never
    // asked to write something the API would then reject.
    const guidance =
      field === 'title'
        ? 'a short, specific title (well under 120 characters) for a requirement on an event-services marketplace — the kind of one-line headline a client posts to hire a photographer, caterer, or venue'
        : 'a clear, well-organised description (well under 5000 characters) for a requirement on an event-services marketplace, covering scope, expectations and logistics';

    try {
      const response = await this.client.chat.completions.create({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `Rephrase the client's text into ${guidance}. Preserve their intent and every concrete detail — dates, counts, budget, location — and improve only clarity, grammar and tone. Reply with the rephrased text alone: no preamble, no quotes, no explanation.`,
          },
          { role: 'user', content: text },
        ],
      });

      const rephrased = response.choices[0]?.message?.content?.trim() ?? '';
      if (!rephrased) {
        throw new Error(`empty response (finish_reason: ${response.choices[0]?.finish_reason})`);
      }
      return rephrased;
    } catch (error) {
      this.logger.error(`Rephrase failed: ${(error as Error).message}`);
      throw new BadGatewayException('AI rephrasing is temporarily unavailable');
    }
  }
}
