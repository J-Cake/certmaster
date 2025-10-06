use quote::quote;

#[proc_macro_derive(FromRedisValue)]
pub fn derive_from_redis_value(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let input = syn::parse_macro_input!(input as syn::DeriveInput);
    let name = input.ident;

    proc_macro::TokenStream::from(quote! {
        impl FromRedisValue for #name {
            fn from_redis_value(v: &redis::Value) -> redis::RedisResult<Self> {
                let str = String::from_redis_value(v)?;

                ron::from_str(&str).map_err(|e| {
                    redis::RedisError::from((redis::ErrorKind::TypeError, "RON decode", e.to_string()))
                })
            }
        }
    })
}

#[proc_macro_derive(ToRedisArgs)]
pub fn derive_to_redis_args(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let input = syn::parse_macro_input!(input as syn::DeriveInput);
    let name = input.ident;

    proc_macro::TokenStream::from(quote! {
        impl ToRedisArgs for #name {

        }
    })
}