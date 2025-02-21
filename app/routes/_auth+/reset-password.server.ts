import { report } from 'conform-react'
import { data, redirect } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { resetPasswordUsernameSessionKey } from './reset-password.tsx'
import { type VerifyFunctionArgs } from './verify.server.ts'

export async function handleVerification({ submission, resultData }: VerifyFunctionArgs) {
	const target = resultData.target
	const user = await prisma.user.findFirst({
		where: { OR: [{ email: target }, { username: target }] },
		select: { email: true, username: true },
	})
	// we don't want to say the user is not found if the email is not found
	// because that would allow an attacker to check if an email is registered
	if (!user) {
		return data(
			{
				result: report<typeof resultData>(submission, {
					error: { fieldError: { code: ['Invalid code'] } }
				}),
			},
			{ status: 400 },
		)
	}

	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(resetPasswordUsernameSessionKey, user.username)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}
