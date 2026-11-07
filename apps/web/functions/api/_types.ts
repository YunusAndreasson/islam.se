/** The runtime capabilities the correction handlers use; small ports keep tests local. */
export interface CorrectionDatabase {
	prepare(sql: string): {
		bind(...values: (string | number | null)[]): {
			first(): Promise<{ id: number } | null>;
		};
	};
}

export interface MailerEnvironment {
	MAILER: {
		fetch(url: string, init: RequestInit): Promise<Pick<Response, "ok" | "status">>;
	};
}

interface CorrectionEnvironment extends MailerEnvironment {
	RATTELSER: CorrectionDatabase;
	IP_SALT?: string;
	TURNSTILE_SECRET?: string;
}

export interface CorrectionContext {
	request: Request;
	env: CorrectionEnvironment;
}

/** Storage inputs shared by both public correction endpoints. */
export type CorrectionInput = {
	page: string;
	passage: string;
	description: string;
	source?: string;
	reporterEmail: string;
	ipHash: string;
} & (
	| { kind: "article"; mosqueId?: never; reason?: never }
	| {
			kind: "mosque";
			mosqueId: string;
			reason: string;
	  }
);
