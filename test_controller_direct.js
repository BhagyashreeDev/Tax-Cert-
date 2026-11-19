import { search } from "./controllers/CA/san_bernardino.controller.js";

const req = {
    body: {
        fetch_type: "api",
        account: "0127-152-01"
    }
};

const res = {
    statusCode: 200,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(data) {
        console.log(`[Response JSON (${this.statusCode})]:`, JSON.stringify(data, null, 2));
    },
    render(view, data) {
        console.log(`[Response Render (${this.statusCode}) view=${view}]:`, JSON.stringify(data, null, 2));
    }
};

(async () => {
    console.log("Calling san_bernardino search controller...");
    await search(req, res);
    console.log("Controller execution completed.");
    process.exit(0);
})();
