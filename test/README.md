# Test data

> This data is used for testing purposes. You'll find keys here. Please **don't** report these as leaked keys - they're
> literally useless. They are meant to demonstrate the functionality of the CA.

## Generate Private keys

For testing purposes, we'll create two keys; One for the service and one for the CA itself.

```shell
openssl ecparam -name prime256v1 -genkey -noout -out service.key
openssl ecparam -name prime256v1 -genkey -noout -out authority.key
```

## OpenSSL Configuration File

We now need to prove to the CA that we are in possession of a private key without sending the key itself to the CA.
We do this by generating a public key from our private key. We send this along with some identifying information to the
authority in a transaction called a *Certificate Signing Request*. Since the authority will want to verify this
information, it expects information in a standard format called *X.509*. We can generate X.509 signing requests using
OpenSSL and a file format containing the information to pass along with the public key.

[See ./service.conf](./service.conf)

## Generate the X.509 CSR

In order to convert the configuration file into an X.509 CSR, we can use the following OpenSSL command

```shell
openssl req -new -key service.key -out service.csr -config service.conf
```

## Generate the CA's certificate

Since the certificate authority itself needs to be legitimised, it also has a certificate. This can be achieved in one
of two ways:

1. either a higher-up certificate authority generates it in the same way with a few minor tweaks, such as allowing the
   resulting certificate to sign others by settings various flags
2. By self-signing the certificate. Normally, this would result in agents validating the certificate to flag it as
   invalid, but since there is no higher-up authority to sign the certificate, these can be implicitly marked as
   trustworthy through mechanisms outside the scope of a certificate authority. This could be by placing the certificate
   in a well-known trust store, through explicit allow-lists or other mechanisms. Authorities whose certificates
   implicitly trusted are referred to as *Root CAs* because they represent the end of a chain.

This is how you generate a self-signed certificate using OpenSSL. It also uses a configuration file because that allows
us to specify various options that are required to make browsers and other clients accept the certificates. You can find
it [under ./authority.conf](./authority.conf).

```shell
openssl req -x509 -key authority.key \
  -out authority.crt \
  -config authority -extensions ca_ext \
  -days 3650 -sha256
```

## Generate the certificate for the service

Before we can actually sign the certificate, it is our job as _authority_ to _authorise_ the service. (crazy, right).
That means it's on us to check the information in the certificate and perform challenges to validate the information.

There are a couple of options that are common:

1. DNS challenges (actually also common outside CAs, for example in hosting providers such as Microsoft 365). These make
   you enter a special code into your DNS control panel that it then validates against its own records. If they match,
   it'll only be because you have access to the control panel in order to make that entry. Therefore, you own the name
   and the validation is complete.
2. The HTTP-based ACME protocol defines a bunch of methods for automatically validating a host's identity by placing 
   single-use tokens in a well-known location which can be matched to a CA's internal records. If they match, the host
   is validated and the certificate can be issued. (BTW, ACME does a bunch of other cool stuff that makes life super 
   easy, but we won't cover that here).
3. A manual roll-out procedure that assumes an underlying security. Yes, sometimes the best thing to do is just not do
   it at all. If you trust the underlying system, then that's a perfectly legitimate form of validation. Certmaster
   offers this in the form of manual challenges. These mark the CSR as pending and await the approval of an
   administrator. At which point the challenge is passed and the certificate may be issued.

In this example we'll assume that the challenge already passed and skip to actually signing the certificate.

```shell
CA_SERIAL=1000 # This is the certificate's serial number. It is used to identify and potentially revoke the certificate.
openssl x509 -req -in service.csr \
  -CA authority.crt -CAkey authority.key \
  -set_serial "1000" \
  -days 365 -sha256 \
  -out service.crt
```

Usually just signing the certificate isn't enough to make browsers and other validating agents accept it, because it
lacks information they are expecting. This can be obtained from the CA's own certificate or through an additional
[config file](authority.conf).

```shell
openssl x509 -req -in service.csr \
  -CA authority.crt -CAkey authority.key \
  -set_serial "1000" \
  -days 365 -sha256 \
  -out service.crt \
  -extfile authority.conf -extensions usr_cert # This line causes OpenSSL to read from the configuration file.
```

The resulting `./service.crt` file is the signed certificate that can be returned to the client.