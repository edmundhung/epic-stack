import {
	type FormControlOptions,
	type Fieldset,
	type Field as FieldType,
	type DefaultValue,
	type Constraint,
	getMetadata,
	isInput,
	useFormControl,
	useInput,
	useFormState,
} from 'conform-react'
import { REGEXP_ONLY_DIGITS_AND_CHARS, type OTPInputProps } from 'input-otp'
import React, { useId, useRef } from 'react'
import { Checkbox, type CheckboxProps } from './ui/checkbox.tsx'
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from './ui/input-otp.tsx'
import { Input } from './ui/input.tsx'
import { Label } from './ui/label.tsx'
import { Textarea } from './ui/textarea.tsx'

export type ListOfErrors = Array<string | null | undefined> | null | undefined

export function ErrorList({
	id,
	errors,
}: {
	errors?: ListOfErrors
	id?: string
}) {
	const errorsToRender = errors?.filter(Boolean)
	if (!errorsToRender?.length) return null
	return (
		<ul id={id} className="flex flex-col gap-1">
			{errorsToRender.map((e) => (
				<li key={e} className="text-[10px] text-foreground-destructive">
					{e}
				</li>
			))}
		</ul>
	)
}

export function Field({
	labelProps,
	inputProps,
	errors,
	className,
}: {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>
	inputProps: React.InputHTMLAttributes<HTMLInputElement>
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = inputProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined
	return (
		<div className={className}>
			<Label htmlFor={id} {...labelProps} />
			<Input
				id={id}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				{...inputProps}
			/>
			<div className="min-h-[32px] px-4 pb-3 pt-1">
				{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
			</div>
		</div>
	)
}

export function OTPField({
	labelProps,
	inputProps,
	errors,
	className,
}: {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>
	inputProps: Partial<OTPInputProps & { render: never }>
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = inputProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined
	return (
		<div className={className}>
			<Label htmlFor={id} {...labelProps} />
			<InputOTP
				pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
				maxLength={6}
				id={id}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				{...inputProps}
			>
				<InputOTPGroup>
					<InputOTPSlot index={0} />
					<InputOTPSlot index={1} />
					<InputOTPSlot index={2} />
				</InputOTPGroup>
				<InputOTPSeparator />
				<InputOTPGroup>
					<InputOTPSlot index={3} />
					<InputOTPSlot index={4} />
					<InputOTPSlot index={5} />
				</InputOTPGroup>
			</InputOTP>
			<div className="min-h-[32px] px-4 pb-3 pt-1">
				{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
			</div>
		</div>
	)
}

export function TextareaField({
	labelProps,
	textareaProps,
	errors,
	className,
}: {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>
	textareaProps: React.TextareaHTMLAttributes<HTMLTextAreaElement>
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = textareaProps.id ?? textareaProps.name ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined
	return (
		<div className={className}>
			<Label htmlFor={id} {...labelProps} />
			<Textarea
				id={id}
				aria-invalid={errorId ? true : undefined}
				aria-describedby={errorId}
				{...textareaProps}
			/>
			<div className="min-h-[32px] px-4 pb-3 pt-1">
				{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
			</div>
		</div>
	)
}

export function CheckboxField({
	labelProps,
	buttonProps,
	errors,
	className,
}: {
	labelProps: React.ComponentProps<'label'>
	buttonProps: CheckboxProps & {
		name: string
		form?: string
		value?: string
	}
	errors?: ListOfErrors
	className?: string
}) {
	const { name, defaultChecked, form, ...checkboxProps } = buttonProps
	const fallbackId = useId()
	const checkedValue = buttonProps.value ?? 'on'
	const input = useInput(defaultChecked ? checkedValue : undefined)
	const checkboxRef = useRef<React.ComponentRef<typeof Checkbox>>(null)
	const id = buttonProps.id ?? fallbackId
	const errorId = errors?.length ? `${id}-error` : undefined

	return (
		<div className={className}>
			<div className="flex gap-2">
				<input
					type="checkbox"
					{...input.visuallyHiddenProps}
					ref={input.register}
					name={name}
					form={form}
					defaultChecked={!!defaultChecked}
					onFocus={() => {
						checkboxRef.current?.focus()
					}}
				/>
				<Checkbox
					{...checkboxProps}
					id={id}
					ref={checkboxRef}
					aria-invalid={errorId ? true : undefined}
					aria-describedby={errorId}
					checked={input.value === checkedValue}
					onCheckedChange={(state) => {
						input.change(state.valueOf() ? checkedValue : '')
						buttonProps.onCheckedChange?.(state)
					}}
					onFocus={(event) => {
						input.focus()
						buttonProps.onFocus?.(event)
					}}
					onBlur={(event) => {
						input.blur()
						buttonProps.onBlur?.(event)
					}}
					type="button"
				/>
				<label
					htmlFor={id}
					{...labelProps}
					className="self-center text-body-xs text-muted-foreground"
				/>
			</div>
			<div className="px-4 pb-3 pt-1">
				{errorId ? <ErrorList id={errorId} errors={errors} /> : null}
			</div>
		</div>
	)
}

interface FormOptions<FormShape, ErrorShape, Value>
	extends FormControlOptions<FormShape, ErrorShape, Value> {
	id?: string
	defaultValue?: NoInfer<DefaultValue<FormShape>>
	constraint?: Constraint
}

export type FormMetadata<ErrorShape = string[]> = ReturnType<
	typeof useForm<unknown, ErrorShape, unknown>
>['form']

export type FieldMetadata<FieldShape, ErrorShape = string[]> = FieldType<
	FieldShape,
	ReturnType<
		typeof useForm<unknown, ErrorShape, unknown>
	>['fields'] extends Fieldset<unknown, infer Metadata>
		? Metadata
		: never
>

export function useForm<FormShape, ErrorShape = string[], Value = undefined>(
	options: FormOptions<FormShape, ErrorShape, Value>,
) {
	const fallbackFormId = useId()
	const formId = options.id ?? fallbackFormId
	const [status, updateStatus] = useFormState(
		(status: 'success' | 'error' | null, { result }) => {
			if (result.intent !== null) {
				return null
			}

			if (typeof result.error === 'undefined') {
				return status
			}

			return result.error === null ? 'success' : 'error'
		},
		{
			initialState: null,
		},
	)
	const { state, handleSubmit, intent } = useFormControl(formId, {
		...options,
		onUpdate(update) {
			updateStatus(update)
			options.onUpdate?.(update)
		},
	})
	const { form, fields } = getMetadata(state, {
		defaultValue: options.defaultValue,
		constraint: options.constraint,
		defineFormMetadata(metadata) {
			return Object.assign(metadata, {
				get id() {
					return formId
				},
				get status() {
					return status
				},
				get errorId() {
					return `${this.id}-error`
				},
				get props() {
					return {
						id: formId,
						onSubmit: handleSubmit,
						onBlur(event) {
							if (isInput(event.target)) {
								intent.validate(event.target.name)
							}
						},
						noValidate: true,
						'aria-invalid': metadata.invalid || undefined,
						'aria-describedby': metadata.invalid ? this.errorId : undefined,
					} satisfies React.DetailedHTMLProps<
						React.FormHTMLAttributes<HTMLFormElement>,
						HTMLFormElement
					>
				},
			})
		},
		defineFieldMetadata(name, metadata) {
			return Object.assign(metadata, {
				get id() {
					return `${formId}-${name}`
				},
				get errorId() {
					return `${this.id}-error`
				},
				get props() {
					return {
						id: this.id,
						name: name,
						required: metadata.required,
						minLength: metadata.minLength,
						maxLength: metadata.maxLength,
						min: metadata.min,
						max: metadata.max,
						step: metadata.step,
						pattern: metadata.pattern,
						multiple: metadata.multiple,
						'aria-invalid': metadata.invalid || undefined,
						'aria-describedby': metadata.invalid ? this.errorId : undefined,
					}
				},
			})
		},
	})

	return {
		form,
		fields,
		intent,
	}
}
