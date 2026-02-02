import React from "react";

export type Entries<Data extends object> = [keyof Data, Data[keyof Data]];

type Props<Data extends object> =
  Omit<React.FormHTMLAttributes<HTMLFormElement>, keyof FormProps<Data>> & FormProps<Data>;

type FormProps<Data extends object> = {
    onSubmit: (data: Data, form: React.FormEvent<HTMLFormElement>) => void;
    children: React.ReactNode | React.ReactNode[];
};

export default function Form<Data extends object>(props: Props<Data>) {
    const onSubmit = React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!(e.currentTarget instanceof HTMLFormElement)) return;

        const data = {} as Data;

        for (const [key, value] of new FormData(e.currentTarget) as unknown as IterableIterator<Entries<Data>>)
            if (key in data)
                data[key] = [data[key], value] as unknown as Data[typeof key];
            else
                data[key] = value;

        props.onSubmit(data, e);

        e.currentTarget.reset();
    }, [props]);

    return <>
        <form {...props} onSubmit={e => onSubmit(e)}>
            {props.children}
        </form>
    </>
};
