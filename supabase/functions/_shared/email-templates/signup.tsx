/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for ICE Alarm España</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://pduhccavshrhfkfbjgmj.supabase.co/storage/v1/object/public/email-assets/logo.png"
          width="64"
          height="64"
          alt="ICE Alarm España"
          style={logo}
        />
        <Heading style={h1}>Welcome to ICE Alarm España</Heading>
        <Text style={text}>
          Thank you for registering with{' '}
          <Link href={siteUrl} style={link}>
            <strong>ICE Alarm España</strong>
          </Link>
          . We're here to keep you safe.
        </Text>
        <Text style={text}>
          Please confirm your email address (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) by clicking the button below:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm My Email
        </Button>
        <Text style={footer}>
          If you didn't create an account with ICE Alarm España, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '480px', margin: '0 auto' }
const logo = { margin: '0 0 24px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#2D3648',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#6B7280',
  lineHeight: '1.6',
  margin: '0 0 25px',
}
const link = { color: '#E74C3C', textDecoration: 'underline' }
const button = {
  backgroundColor: '#E74C3C',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '30px 0 0' }
