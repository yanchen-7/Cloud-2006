from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, send_from_directory, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager,
    UserMixin,
    login_user,
    login_required,
    current_user,
    logout_user,
)
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
app.config["SECRET_KEY"] = app.config.get("SECRET_KEY", "dev-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"sqlite:///{(BASE_DIR / 'app.db').as_posix()}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"


class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    gender = db.Column(db.String(32))
    date_of_birth = db.Column(db.Date, nullable=True)
    mobile_number = db.Column(db.String(64))
    country_of_origin = db.Column(db.String(128))

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw) -> bool:
        return check_password_hash(self.password_hash, raw)


@login_manager.user_loader
def load_user(user_id):
    try:
        return User.query.get(int(user_id))
    except Exception:
        return None


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/csv")
def serve_csv():
    # Expose the CSV for client-side parsing (read-only UI)
    return send_from_directory(str(BASE_DIR), "singapore_data_with_category.csv")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory("static", "favicon.ico")


# Auth routes
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            flash("Invalid username or password.", "error")
            return render_template("login.html")
        login_user(user)
        flash("Logged in successfully.", "success")
        next_url = request.args.get("next") or url_for("index")
        return redirect(next_url)
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        if not username or not email or not password:
            flash("All fields are required.", "error")
            return render_template("register.html")
        if password != confirm:
            flash("Passwords do not match.", "error")
            return render_template("register.html")
        if User.query.filter((User.username == username) | (User.email == email)).first():
            flash("Username or email already exists.", "error")
            return render_template("register.html")
        user = User(username=username, email=email)
        user.set_password(password)
        # Optional fields
        user.gender = request.form.get("gender") or None
        dob = request.form.get("date_of_birth")
        if dob:
            try:
                user.date_of_birth = datetime.fromisoformat(dob).date()
            except Exception:
                pass
        user.mobile_number = request.form.get("mobile_number") or None
        user.country_of_origin = request.form.get("country_of_origin") or None
        db.session.add(user)
        db.session.commit()
        flash("Registration successful. Please login.", "success")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out.", "info")
    return redirect(url_for("index"))


@app.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        if email:
            current_user.email = email
        current_user.gender = request.form.get("gender") or None
        dob = request.form.get("date_of_birth")
        if dob:
            try:
                current_user.date_of_birth = datetime.fromisoformat(dob).date()
            except Exception:
                pass
        current_user.mobile_number = request.form.get("mobile_number") or None
        current_user.country_of_origin = request.form.get("country_of_origin") or None
        # Optional password reset
        pwd = request.form.get("password") or None
        confirm = request.form.get("confirm_password") or None
        if pwd:
            if pwd != confirm:
                flash("Passwords do not match.", "error")
            else:
                current_user.set_password(pwd)
                flash("Password updated.", "success")
        db.session.commit()
        flash("Profile updated.", "success")
    return render_template("profile.html", user=current_user)


@app.route("/forgot", methods=["GET", "POST"])
def forgot():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        if not email:
            flash("Please enter your email.", "error")
        else:
            # Stub: in production, email a reset link
            flash("If that email exists, a reset link has been sent.", "info")
            return redirect(url_for("login"))
    return render_template("forgot.html")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)
