export default function Link({ href, children, ...rest }: any) { return <a href={String(href)} {...rest}>{children}</a>; }
